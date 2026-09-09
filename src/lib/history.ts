import { read, write } from './storage';
import type { Guard } from './storage';

/**
 * What you have played, and when.
 *
 * Deliberately thin: a deck id, a start time, and how long it was open. No
 * content, no answers, no outcome. The vault already holds the things you made;
 * this holds only the fact that an evening happened, which is the part you
 * cannot reconstruct later and the part that makes forty games feel like a
 * record rather than a menu.
 *
 * Written on the way OUT, because that is the only point at which the duration
 * is known. But whether it counts at all is decided by whether the rules screen
 * was ever left, not by how long the screen was open. A duration threshold was
 * the obvious proxy and the wrong one: it calls a twenty-second round of Time
 * Bomb "not played" and a phone left face-up on the rules screen "played".
 * Every engine starts through the same Rules component, so there is exactly one
 * place that knows the difference.
 */

const KEY = 'history';

/** Long enough that a phone left face-up overnight does not read as a marathon. */
const CAP_MS = 4 * 3600_000;

/** Plenty to see a year of evenings, small enough to stay a cheap read. */
const MAX_ENTRIES = 400;

export interface Play {
  deckId: string;
  /** When the deck was opened. */
  at: number;
  /** How long it stayed open, in ms. */
  ms: number;
}

const isPlay = (v: unknown): v is Play => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.deckId === 'string' && typeof o.at === 'number' && typeof o.ms === 'number';
};

export const isHistory: Guard<Play[]> = (v): v is Play[] => Array.isArray(v) && v.every(isPlay);

export function readHistory(): Play[] {
  return read<Play[]>(KEY, [], isHistory);
}

/** Newest first. */
export function record(deckId: string, at: number, ms: number): Play[] {
  const entry: Play = { deckId, at, ms: Math.min(ms, CAP_MS) };
  const next = [entry, ...readHistory()].slice(0, MAX_ENTRIES);
  write(KEY, next);
  return next;
}

export function clearHistory(): void {
  write(KEY, []);
}

export interface DeckPlays {
  deckId: string;
  times: number;
  last: number;
  totalMs: number;
}

/** One row per deck, most played first. */
export function byDeck(history: readonly Play[]): DeckPlays[] {
  const map = new Map<string, DeckPlays>();
  for (const p of history) {
    const row = map.get(p.deckId) ?? { deckId: p.deckId, times: 0, last: 0, totalMs: 0 };
    row.times += 1;
    row.last = Math.max(row.last, p.at);
    row.totalMs += p.ms;
    map.set(p.deckId, row);
  }
  return [...map.values()].sort((a, b) => b.times - a.times || b.last - a.last);
}

export function minutes(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/**
 * Relative, in the words people use. An exact timestamp on "when did we last
 * play this" is precision nobody wants and everybody has to decode.
 */
export function whenLabel(at: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(at)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
