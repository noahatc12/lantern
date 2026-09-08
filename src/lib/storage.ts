/**
 * localStorage wrapper.
 *
 * Every access is wrapped because the accessor itself throws in some contexts
 * (private windows, blocked site data), not just returns null. A thrown
 * exception on read must degrade to "no stored value", never crash the app.
 *
 * Reads are also VALIDATED. Storage is the one place where data from an older
 * build of the app arrives at a newer one, and `JSON.parse` will happily hand
 * back a shape that no longer matches what the caller was told to expect.
 * Without a guard, `read<Names>('names', ['', ''])` returns whatever is on disk
 * typed as Names, and the crash surfaces somewhere unrelated with no route back
 * to a working app. A wrong shape is dropped and the fallback used instead.
 *
 * Note for iOS: Safari and a home-screen (standalone) install are SEPARATE
 * storage partitions. Data written in one is invisible to the other. Measured
 * on a real iPhone 14, 2026-09-07.
 */

const PREFIX = 'lantern.';

export type Guard<T> = (value: unknown) => value is T;

export function read<T>(key: string, fallback: T, isValid?: Guard<T>): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isValid && !isValid(parsed)) {
      // Written by a different shape of this app. Drop it rather than hand a
      // caller something it will crash on later.
      remove(key);
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Actually removes. When the UI says deleted, it is deleted. */
export function remove(key: string): boolean {
  try {
    localStorage.removeItem(PREFIX + key);
    return true;
  } catch {
    return false;
  }
}

export function available(): boolean {
  try {
    const probe = PREFIX + '__probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
   Guards, one per stored shape. Kept here so every persisted shape in the app
   is declared in one place and none can be added without one.
   --------------------------------------------------------------------------- */

const isStr = (v: unknown): v is string => typeof v === 'string';

export const isNames: Guard<[string, string]> = (v): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && v.every(isStr);

export const isTier: Guard<1 | 2 | 3 | 4 | 5> = (v): v is 1 | 2 | 3 | 4 | 5 =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

export const isStringArray: Guard<string[]> = (v): v is string[] =>
  Array.isArray(v) && v.every(isStr);

export const isNullableString: Guard<string | null> = (v): v is string | null =>
  v === null || isStr(v);

export interface MatchResult {
  at: number;
  both: string[];
  partial: string[];
}

export const isMatchResult: Guard<MatchResult | null> = (v): v is MatchResult | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.at === 'number' && isStringArray(o.both) && isStringArray(o.partial);
};

export interface VaultItem {
  id: string;
  from: number;
  text: string;
  createdAt: number;
  unlockAt?: number;
  redeemedAt?: number;
}

export const isProps: Guard<string[]> = isStringArray;

export interface Resume {
  deckId: string;
  at: number;
}

export const isResume: Guard<Resume | null> = (v): v is Resume | null => {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return isStr(o.deckId) && typeof o.at === 'number';
};

export const isBool: Guard<boolean> = (v): v is boolean => typeof v === 'boolean';

export const isVaultItems: Guard<VaultItem[]> = (v): v is VaultItem[] =>
  Array.isArray(v) &&
  v.every((it) => {
    if (!it || typeof it !== 'object') return false;
    const o = it as Record<string, unknown>;
    return (
      isStr(o.id) &&
      typeof o.from === 'number' &&
      isStr(o.text) &&
      typeof o.createdAt === 'number'
    );
  });

/**
 * Every stored key under our prefix, prefix stripped.
 *
 * Needed by two things that have to be exhaustive rather than approximate:
 * "erase everything on this device", which must not leave a per-deck key
 * behind, and the vault's saved-results list, which is keyed per deck and so
 * cannot be found without enumerating.
 */
export function keys(): string[] {
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Removes every key this app owns. `keep` is for the content key, which is a
 * decryption credential rather than something either of you put in: erasing
 * your data should not also demand the passphrase again.
 */
export function clearAll(keep: string[] = []): void {
  const spare = new Set(keep);
  for (const k of keys()) if (!spare.has(k)) remove(k);
}
