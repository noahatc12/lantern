#!/usr/bin/env node
/**
 * Seals every deck into ONE opaque bundle: public/content.enc
 *
 * One file rather than one per deck, deliberately. Per-deck filenames would
 * leak deck titles to anyone who lists the directory, and the titles are
 * content. A single blob reveals nothing but its size.
 *
 * Run before pushing whenever deck source changes:
 *
 *   LANTERN_PASSPHRASE='...' npm run seal
 *
 * The passphrase is read from the environment and never written anywhere. It
 * does not go in the repo, in CI, or in Actions secrets. If it is lost the
 * content is unrecoverable, which is the intended property.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 600_000;
const DECK_DIR = path.resolve('decks');
const OUT = path.resolve('public', 'content.enc');

const passphrase = process.env.LANTERN_PASSPHRASE;
if (!passphrase) {
  console.error('LANTERN_PASSPHRASE is not set. Refusing to seal.');
  console.error("Usage:  LANTERN_PASSPHRASE='your phrase' npm run seal");
  process.exit(1);
}
if (passphrase.length < 12) {
  console.error(
    `Passphrase is ${passphrase.length} characters. Use at least 12.\n` +
      'This is the only thing standing between the content and anyone with the URL.',
  );
  process.exit(1);
}

const enc = new TextEncoder();

function toB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function deriveKey(pass, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
}

async function main() {
  if (!existsSync(DECK_DIR)) {
    console.error(`No decks/ directory at ${DECK_DIR}. Nothing to seal.`);
    process.exit(1);
  }

  const files = (await readdir(DECK_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('decks/ contains no .json source. Nothing to seal.');
    process.exit(1);
  }

  const decks = [];
  for (const file of files) {
    const deck = JSON.parse(await readFile(path.join(DECK_DIR, file), 'utf8'));
    decks.push(deck);
  }

  const bundle = JSON.stringify({ v: 1, sealedAt: new Date().toISOString(), decks });

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(bundle));

  const payload = {
    v: 1,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(buf)),
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload), 'utf8');

  // Sanity: the ciphertext must not contain any plaintext card text. Cheap,
  // and it catches a catastrophic mistake (writing the bundle unencrypted)
  // that would otherwise be invisible until someone read the deployed file.
  const written = await readFile(OUT, 'utf8');
  const sample = decks[0]?.cards?.[0]?.text;
  if (sample && written.includes(sample)) {
    console.error('FATAL: plaintext found in the sealed output. Refusing to leave it on disk.');
    await writeFile(OUT, '', 'utf8');
    process.exit(1);
  }

  const cards = decks.reduce((n, d) => n + (d.cards?.length ?? 0), 0);
  console.log(
    `sealed ${decks.length} deck(s), ${cards} card(s) -> public/content.enc ` +
      `(${(written.length / 1024).toFixed(1)} kB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
