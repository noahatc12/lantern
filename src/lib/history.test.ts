import { describe, expect, it } from 'vitest';
import { byDeck, minutes, whenLabel } from './history';
import type { Play } from './history';

/**
 * The history is the only thing in the app that turns forty games into a record
 * of something. Its summaries are what people read, so they are what is tested:
 * the raw array is trivial and the roll-up is where it would quietly lie.
 */

const DAY = 86400000;
const play = (deckId: string, at: number, ms = 60000): Play => ({ deckId, at, ms });

describe('byDeck', () => {
  it('counts every session of a deck, not every deck', () => {
    const rows = byDeck([
      play('a', 3 * DAY),
      play('a', 2 * DAY),
      play('b', 1 * DAY),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ deckId: 'a', times: 2 });
  });

  it('puts the most played first, and the most recent first within a tie', () => {
    const rows = byDeck([play('quiet', 9 * DAY), play('loud', 1 * DAY), play('loud', 2 * DAY)]);
    expect(rows.map((r) => r.deckId)).toEqual(['loud', 'quiet']);
  });

  it('reports the LAST time a deck was played, not the first seen', () => {
    const rows = byDeck([play('a', 1 * DAY), play('a', 8 * DAY)]);
    expect(rows[0]!.last).toBe(8 * DAY);
  });

  it('totals the time rather than averaging it', () => {
    const rows = byDeck([play('a', 1 * DAY, 60000), play('a', 2 * DAY, 120000)]);
    expect(rows[0]!.totalMs).toBe(180000);
  });

  it('is empty for an empty history rather than throwing', () => {
    expect(byDeck([])).toEqual([]);
  });
});

describe('whenLabel', () => {
  // Calendar days, not elapsed hours. Something played at 11pm is "yesterday"
  // at 1am, which is what a person means and what a 24-hour window gets wrong.
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime();

  it('calls the same calendar day today', () => {
    expect(whenLabel(new Date(2026, 5, 15, 1, 0, 0).getTime(), now)).toBe('today');
  });

  it('calls late last night yesterday, not today', () => {
    expect(whenLabel(new Date(2026, 5, 14, 23, 30, 0).getTime(), now)).toBe('yesterday');
  });

  it('counts days inside a week', () => {
    expect(whenLabel(new Date(2026, 5, 12).getTime(), now)).toBe('3 days ago');
  });

  it('rounds to weeks and then months', () => {
    expect(whenLabel(new Date(2026, 4, 25).getTime(), now)).toMatch(/weeks ago/);
    expect(whenLabel(new Date(2026, 1, 15).getTime(), now)).toMatch(/months ago/);
  });
});

describe('minutes', () => {
  it('does not round a real session down to nothing', () => {
    expect(minutes(45000)).toBe('1 min');
  });

  it('says so when it really was under a minute', () => {
    expect(minutes(5000)).toBe('under a minute');
  });

  it('switches to hours when minutes stop being readable', () => {
    expect(minutes(3600000)).toBe('1h');
    expect(minutes(3600000 + 20 * 60000)).toBe('1h 20m');
  });
});
