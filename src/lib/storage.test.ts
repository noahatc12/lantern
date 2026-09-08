import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll,
  isMatchResult,
  isNames,
  isStringArray,
  isTier,
  isVaultItems,
  keys,
  read,
  write,
} from './storage';

/**
 * The point of these is the CORRUPT cases, not the happy path.
 *
 * Storage is where data written by an older build of the app reaches a newer
 * one. Before this, `read` handed back whatever JSON was on disk, typed as
 * whatever the caller asked for, and the crash surfaced somewhere unrelated
 * with no route back to a working app. A wrong shape must degrade to the
 * fallback, quietly and every time.
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

const mem = new MemoryStorage();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = mem;
});

describe('read with a guard', () => {
  it('returns the stored value when the shape is right', () => {
    write('names', ['Noah', 'Lily']);
    expect(read('names', ['', ''], isNames)).toEqual(['Noah', 'Lily']);
  });

  it('falls back when the stored shape is wrong', () => {
    write('names', 'just a string');
    expect(read('names', ['a', 'b'], isNames)).toEqual(['a', 'b']);
  });

  it('DELETES the bad value so it cannot keep costing a parse', () => {
    write('names', { not: 'an array' });
    read('names', ['a', 'b'], isNames);
    expect(mem.getItem('lantern.names')).toBeNull();
  });

  it('falls back on malformed JSON rather than throwing', () => {
    mem.setItem('lantern.names', '{ this is not json');
    expect(read('names', ['a', 'b'], isNames)).toEqual(['a', 'b']);
  });

  it('falls back when the array is the wrong length', () => {
    write('names', ['only one']);
    expect(read('names', ['a', 'b'], isNames)).toEqual(['a', 'b']);
  });

  it('survives localStorage throwing on access', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    expect(read('names', ['a', 'b'], isNames)).toEqual(['a', 'b']);
    expect(write('names', ['x', 'y'])).toBe(false);
  });
});

describe('guards', () => {
  it('isTier accepts only integers 1 to 5', () => {
    for (const good of [1, 2, 3, 4, 5]) expect(isTier(good)).toBe(true);
    for (const bad of [0, 6, 2.5, '3', null, undefined, NaN]) expect(isTier(bad)).toBe(false);
  });

  it('isStringArray rejects mixed arrays', () => {
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(['a', 2])).toBe(false);
    expect(isStringArray('a')).toBe(false);
  });

  it('isMatchResult accepts null and a full result, rejects partial ones', () => {
    expect(isMatchResult(null)).toBe(true);
    expect(isMatchResult({ at: 1, both: [], partial: [] })).toBe(true);
    expect(isMatchResult({ at: 1, both: [] })).toBe(false);
    expect(isMatchResult({ at: 'soon', both: [], partial: [] })).toBe(false);
  });

  it('isVaultItems rejects entries missing required fields', () => {
    expect(isVaultItems([])).toBe(true);
    expect(isVaultItems([{ id: 'a', from: 0, text: 't', createdAt: 1 }])).toBe(true);
    expect(isVaultItems([{ id: 'a', from: 0, text: 't' }])).toBe(false);
    expect(isVaultItems([null])).toBe(false);
  });

  it('a tier written as a string by an older build does not survive a read', () => {
    write('maxTier', '4');
    expect(read('maxTier', 2, isTier)).toBe(2);
  });
});

describe('keys and clearAll', () => {
  it('lists only this app’s keys, with the prefix stripped', () => {
    write('names', ['a', 'b']);
    write('seen.truth-or-dare', ['x']);
    mem.setItem('someone-elses-key', '1');
    expect(keys().sort()).toEqual(['names', 'seen.truth-or-dare']);
  });

  it('erases everything it owns and nothing it does not', () => {
    write('names', ['a', 'b']);
    write('vault.items', []);
    mem.setItem('someone-elses-key', '1');
    clearAll();
    expect(keys()).toEqual([]);
    expect(mem.getItem('someone-elses-key')).toBe('1');
  });

  it('spares the keys it is told to spare', () => {
    // The content key is a decryption credential rather than something either
    // person put in, so erasing your data must not also demand the passphrase.
    write('contentKey', 'abc');
    write('names', ['a', 'b']);
    clearAll(['contentKey']);
    expect(keys()).toEqual(['contentKey']);
  });
});
