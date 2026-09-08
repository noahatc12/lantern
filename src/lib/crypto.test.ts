import { describe, expect, it } from 'vitest';
import { exportKey, importKey, seal, unseal, unsealWithKey } from './crypto';

/**
 * Round-trip is the weak test here. The ones that matter are the negative
 * cases: a wrong passphrase must FAIL rather than return garbage, and tampered
 * ciphertext must be rejected. AES-GCM authenticates, so both should throw, and
 * asserting that is what proves the content is actually protected rather than
 * merely scrambled.
 */

const SECRET = 'correct horse battery staple';
const PLAIN = JSON.stringify({ id: 'deck', cards: [{ id: 'a', text: 'hello', tier: 3 }] });

describe('seal / unseal', () => {
  it('round-trips exactly', async () => {
    const sealed = await seal(PLAIN, SECRET);
    expect(await unseal(sealed, SECRET)).toBe(PLAIN);
  });

  it('never stores the plaintext in the payload', async () => {
    const sealed = await seal(PLAIN, SECRET);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toContain('hello');
    expect(blob).not.toContain('cards');
    expect(blob).not.toContain(SECRET);
  });

  it('produces different ciphertext each time for the same input', async () => {
    const a = await seal(PLAIN, SECRET);
    const b = await seal(PLAIN, SECRET);
    expect(a.data).not.toBe(b.data);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('REJECTS a wrong passphrase rather than returning garbage', async () => {
    const sealed = await seal(PLAIN, SECRET);
    await expect(unseal(sealed, 'wrong passphrase')).rejects.toThrow();
  });

  it('REJECTS tampered ciphertext', async () => {
    const sealed = await seal(PLAIN, SECRET);
    const bytes = atob(sealed.data).split('');
    bytes[0] = String.fromCharCode(bytes[0]!.charCodeAt(0) ^ 0xff);
    const tampered = { ...sealed, data: btoa(bytes.join('')) };
    await expect(unseal(tampered, SECRET)).rejects.toThrow();
  });

  it('REJECTS a swapped salt, so the KDF cannot be sidestepped', async () => {
    const a = await seal(PLAIN, SECRET);
    const b = await seal(PLAIN, SECRET);
    await expect(unseal({ ...a, salt: b.salt }, SECRET)).rejects.toThrow();
  });
});

describe('key caching', () => {
  it('a cached key decrypts the payload it was derived for', async () => {
    const sealed = await seal(PLAIN, SECRET);
    const { deriveKey } = await import('./crypto');
    const key = await deriveKey(SECRET, Uint8Array.from(atob(sealed.salt), (c) => c.charCodeAt(0)));
    const exported = await exportKey(key);
    const reimported = await importKey(exported);
    expect(await unsealWithKey(sealed, reimported)).toBe(PLAIN);
  });

  it('a cached key from a different passphrase does not decrypt', async () => {
    const sealed = await seal(PLAIN, SECRET);
    const { deriveKey } = await import('./crypto');
    const wrong = await deriveKey(
      'not the passphrase',
      Uint8Array.from(atob(sealed.salt), (c) => c.charCodeAt(0)),
    );
    await expect(unsealWithKey(sealed, wrong)).rejects.toThrow();
  });
});
