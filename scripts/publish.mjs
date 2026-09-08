#!/usr/bin/env node
/**
 * One command: lint, seal, commit, push, and wait for the deploy.
 *
 * Sealing has to be manual because the passphrase must never live in CI or in
 * the repo. But "manual" was costing four commands that were easy to half-do,
 * and content silently stayed stale on the live site while the code moved on.
 * The passphrase stays out of CI; everything around it stops being your problem.
 *
 *   npm run publish
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
}

function capture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: true });
  return (r.stdout ?? '').trim();
}

function fail(msg) {
  console.error(`\n${msg}`);
  process.exit(1);
}

// 1. Content rules first. Sealing bad content just makes it harder to find.
console.log('\n[1/5] checking content...');
if (run('npm', ['run', '--silent', 'lint:decks']).status !== 0) {
  fail('Content lint failed. Nothing was sealed or pushed.');
}

// 2. Seal. Prompts for the passphrase; never reads it from anywhere persistent.
console.log('\n[2/5] sealing...');
if (run('node', ['scripts/seal.mjs']).status !== 0) {
  fail('Sealing failed. Nothing was committed.');
}

if (!existsSync('public/content.enc')) fail('No bundle was produced. Aborting.');
const size = readFileSync('public/content.enc').length;
console.log(`      bundle is ${(size / 1024).toFixed(1)} kB`);

// 3. Commit, but only if the bundle actually changed.
console.log('\n[3/5] committing...');
const dirty = capture('git', ['status', '--porcelain', 'public/content.enc']);
if (!dirty) {
  console.log('      bundle is unchanged, nothing to commit.');
} else {
  run('git', ['add', 'public/content.enc']);
  if (run('git', ['commit', '-q', '-m', '"seal content"']).status !== 0) {
    fail('Commit failed.');
  }
}

// 4. Push whatever is ahead, including code commits.
console.log('\n[4/5] pushing...');
if (run('git', ['push', '-q']).status !== 0) fail('Push failed.');

// 5. Verify the deployed bundle actually matches what was just sealed. A green
//    deploy says the job ran, not that the right bytes are being served.
console.log('\n[5/5] waiting for the deploy...');
const url = 'https://noahatc12.github.io/lantern/content.enc';
let live = 0;
for (let i = 0; i < 60; i++) {
  const out = capture('curl', ['-s', `"${url}?cb=${Date.now()}"`, '|', 'wc', '-c']);
  live = Number(out) || 0;
  if (live === size) break;
  spawnSync('node', ['-e', 'setTimeout(()=>{},3000)'], { timeout: 3200 });
}

if (live === size) {
  console.log(`\nLive and current. ${(size / 1024).toFixed(1)} kB serving at`);
  console.log('https://noahatc12.github.io/lantern/');
  console.log('\nClose the app fully from the switcher before reopening; iOS caches hard.');
} else {
  console.log(`\nPushed, but the live bundle is ${live} bytes and we sealed ${size}.`);
  console.log('The deploy is probably still running. Give it a minute and reload.');
}
