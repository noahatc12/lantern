import { exportKey, importKey, deriveKey, fromB64, unsealWithKey } from './crypto';
import type { SealedPayload } from './crypto';
import { read, write, remove } from './storage';
import type { Deck } from '../types';

/**
 * Loads and decrypts the sealed content bundle.
 *
 * The derived key is cached, not the passphrase. A cached key unlocks this
 * device only and reveals nothing about what was typed.
 */

const KEY_CACHE = 'contentKey';

export interface Bundle {
  v: 1;
  sealedAt: string;
  decks: Deck[];
}

export type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'locked' }
  | { status: 'unlocked'; bundle: Bundle }
  | { status: 'error'; message: string };

async function fetchPayload(): Promise<SealedPayload | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}content.enc`, { cache: 'no-cache' });
  if (!res.ok) return null;
  try {
    return (await res.json()) as SealedPayload;
  } catch {
    return null;
  }
}

/** Tries the cached key. Returns null if there is none or it no longer works. */
export async function tryCached(): Promise<Bundle | null> {
  const cached = read<string | null>(KEY_CACHE, null);
  if (!cached) return null;
  const payload = await fetchPayload();
  if (!payload) return null;
  try {
    const key = await importKey(cached);
    return JSON.parse(await unsealWithKey(payload, key)) as Bundle;
  } catch {
    // Key no longer opens it, most likely because the content was resealed
    // with a different passphrase. Drop it and ask again.
    remove(KEY_CACHE);
    return null;
  }
}

export async function unlock(passphrase: string): Promise<Bundle> {
  const payload = await fetchPayload();
  if (!payload) throw new Error('No content bundle found. Has it been sealed yet?');

  const key = await deriveKey(passphrase, fromB64(payload.salt));
  // Throws on a wrong passphrase. AES-GCM authenticates, so this is a real
  // check rather than a guess about whether the output looks like JSON.
  const json = await unsealWithKey(payload, key);
  write(KEY_CACHE, await exportKey(key));
  return JSON.parse(json) as Bundle;
}

export async function hasContent(): Promise<boolean> {
  return (await fetchPayload()) !== null;
}

export function forget(): void {
  remove(KEY_CACHE);
}
