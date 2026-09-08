/**
 * Content decryption.
 *
 * Decks ship as AES-GCM ciphertext. The passphrase is never in the repo, never
 * in CI, never in Actions secrets. It exists in two heads and, after first
 * unlock, as a derived key in this device's localStorage.
 *
 * This is what actually makes the content private. The published page is
 * readable by anyone with the URL no matter what the repository settings say,
 * so repo visibility protects the source and this protects the content.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface SealedPayload {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(plaintext: string, passphrase: string): Promise<SealedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext),
  );
  return {
    v: 1,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(buf)),
  };
}

/** Throws on a wrong passphrase. AES-GCM authenticates, so this is not a guess. */
export async function unseal(payload: SealedPayload, passphrase: string): Promise<string> {
  const salt = fromB64(payload.salt);
  const iv = fromB64(payload.iv);
  const key = await deriveKey(passphrase, salt);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    fromB64(payload.data) as BufferSource,
  );
  return dec.decode(buf);
}

/**
 * Export the derived key so a later open skips the 600k-iteration derivation.
 * Caching the KEY rather than the passphrase means the passphrase itself is
 * never written to disk.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toB64(new Uint8Array(raw));
}

export async function importKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(b64) as BufferSource, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function unsealWithKey(
  payload: SealedPayload,
  key: CryptoKey,
): Promise<string> {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(payload.iv) as BufferSource },
    key,
    fromB64(payload.data) as BufferSource,
  );
  return dec.decode(buf);
}
