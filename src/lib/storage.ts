/**
 * localStorage wrapper.
 *
 * Every access is wrapped because the accessor itself throws in some contexts
 * (private windows, blocked site data), not just returns null. A thrown
 * exception on read must degrade to "no stored value", never crash the app.
 *
 * Note for iOS: Safari and a home-screen (standalone) install are SEPARATE
 * storage partitions. Data written in one is invisible to the other. Measured
 * on a real iPhone 14, 2026-09-07.
 */

const PREFIX = 'lantern.';

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
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
