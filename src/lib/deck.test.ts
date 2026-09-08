import { describe, expect, it } from 'vitest';
import {
  applyLight,
  currentTier,
  draw,
  ladderTier,
  mulberry32,
  nextTurn,
  playable,
  poolProgress,
  propsUsed,
  shuffle,
  startSession,
} from './deck';
import type { Card, Deck, SessionConfig, Tier } from '../types';

/**
 * The properties worth testing here are not "does it return a card" but the two
 * invariants that decide how a session feels: a card never repeats before the
 * pool is exhausted, and a card above the ceiling is never drawn at all. Both
 * are checked across many seeds rather than one, because a single seed can pass
 * a shuffle bug by luck.
 */

function makeCard(id: string, tier: Tier, props?: string[]): Card {
  return { id, text: `card ${id}`, tier, ...(props ? { props } : {}) };
}

function makeDeck(cards: Card[]): Deck {
  return {
    id: 'test',
    title: 'Test',
    blurb: '',
    engine: 'draw',
    tierRange: [1, 5],
    tags: [],
    duration: 'short',
    cards,
  };
}

function config(over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    deckId: 'test',
    maxTier: 5,
    availableProps: [],
    ladder: false,
    ladderStep: 6,
    ...over,
  };
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('shuffle', () => {
  it('is a permutation, never dropping or duplicating an element', () => {
    const input = Array.from({ length: 25 }, (_, i) => i);
    for (const seed of SEEDS) {
      const out = shuffle(input, mulberry32(seed));
      expect(out).toHaveLength(input.length);
      expect([...out].sort((a, b) => a - b)).toEqual(input);
    }
  });

  it('is deterministic for a given seed', () => {
    const input = Array.from({ length: 25 }, (_, i) => i);
    expect(shuffle(input, mulberry32(42))).toEqual(shuffle(input, mulberry32(42)));
  });
});

describe('draw: no repeat before exhaustion', () => {
  it('yields every card exactly once across a full pass, for every seed', () => {
    const cards = Array.from({ length: 12 }, (_, i) => makeCard(`c${i}`, 3));
    const deck = makeDeck(cards);

    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      let state = startSession(config());
      state = { ...state, drawn: [] };

      const seen: string[] = [];
      for (let i = 0; i < cards.length; i++) {
        const res = draw(deck, state, rng);
        expect(res.card).not.toBeNull();
        expect(res.recycled).toBe(false);
        seen.push(res.card!.id);
        state = res.state;
      }

      expect(new Set(seen).size).toBe(cards.length);
    }
  });

  it('recycles exactly once the pool is spent, not before', () => {
    const cards = Array.from({ length: 5 }, (_, i) => makeCard(`c${i}`, 3));
    const deck = makeDeck(cards);
    const rng = mulberry32(7);
    let state = { ...startSession(config()), drawn: [] as string[] };

    for (let i = 0; i < cards.length; i++) {
      const res = draw(deck, state, rng);
      expect(res.recycled).toBe(false);
      state = res.state;
    }

    const after = draw(deck, state, rng);
    expect(after.recycled).toBe(true);
    expect(after.card).not.toBeNull();
    expect(after.state.drawn).toHaveLength(1);
  });
});

describe('draw: tier ceiling is never exceeded', () => {
  it('never returns a card above the ceiling, across seeds and ceilings', () => {
    const cards: Card[] = [];
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 4; i++) cards.push(makeCard(`t${tier}-${i}`, tier as Tier));
    }
    const deck = makeDeck(cards);

    for (const maxTier of [1, 2, 3, 4, 5] as Tier[]) {
      for (const seed of SEEDS.slice(0, 50)) {
        const rng = mulberry32(seed);
        let state = { ...startSession(config({ maxTier })), drawn: [] as string[] };
        for (let i = 0; i < 30; i++) {
          const res = draw(deck, state, rng);
          if (!res.card) break;
          expect(res.card.tier).toBeLessThanOrEqual(maxTier);
          state = res.state;
        }
      }
    }
  });

  it('returns null rather than a too-hot card when nothing is eligible', () => {
    const deck = makeDeck([makeCard('hot', 5)]);
    const state = { ...startSession(config({ maxTier: 2 })), drawn: [] as string[] };
    expect(draw(deck, state, mulberry32(1)).card).toBeNull();
  });
});

describe('traffic light', () => {
  it('red stops all draws', () => {
    const deck = makeDeck([makeCard('a', 1)]);
    let state = { ...startSession(config()), drawn: [] as string[] };
    state = applyLight(state, 'red');
    expect(draw(deck, state, mulberry32(1)).card).toBeNull();
  });

  it('yellow lowers the ceiling and later draws respect it', () => {
    const cards = [makeCard('lo', 2), makeCard('hi', 5)];
    const deck = makeDeck(cards);
    let state = { ...startSession(config({ maxTier: 5 })), drawn: [] as string[] };

    state = applyLight(state, 'yellow');
    expect(state.effectiveTier).toBe(4);

    state = applyLight(applyLight(state, 'yellow'), 'yellow');
    expect(state.effectiveTier).toBe(2);

    for (let i = 0; i < 20; i++) {
      const res = draw(deck, state, mulberry32(i + 1));
      if (res.card) expect(res.card.tier).toBeLessThanOrEqual(2);
    }
  });

  it('yellow never drops below tier 1', () => {
    let state = { ...startSession(config({ maxTier: 2 })), drawn: [] as string[] };
    for (let i = 0; i < 10; i++) state = applyLight(state, 'yellow');
    expect(state.effectiveTier).toBe(1);
  });

  it('records nothing about which player triggered it', () => {
    const state = applyLight({ ...startSession(config()), drawn: [] }, 'yellow');
    expect(JSON.stringify(state)).not.toMatch(/player|who|triggeredBy/i);
  });
});

describe('ladder', () => {
  it('opens at tier 1 and climbs one step at a time up to the ceiling', () => {
    const cfg = config({ ladder: true, ladderStep: 3, maxTier: 4 });
    expect(ladderTier(cfg, 0)).toBe(1);
    expect(ladderTier(cfg, 2)).toBe(1);
    expect(ladderTier(cfg, 3)).toBe(2);
    expect(ladderTier(cfg, 6)).toBe(3);
    expect(ladderTier(cfg, 9)).toBe(4);
    expect(ladderTier(cfg, 100)).toBe(4);
  });

  it('does not draw a tier-5 card on the opening draw', () => {
    const cards = [makeCard('easy', 1), makeCard('hot', 5)];
    const deck = makeDeck(cards);
    for (const seed of SEEDS.slice(0, 50)) {
      const state = {
        ...startSession(config({ ladder: true, ladderStep: 6, maxTier: 5 })),
        drawn: [] as string[],
      };
      const res = draw(deck, state, mulberry32(seed));
      expect(res.card?.tier).toBe(1);
    }
  });
});

describe('props filtering', () => {
  it('excludes cards needing props the players do not have', () => {
    const deck = makeDeck([makeCard('needs', 3, ['blindfold']), makeCard('plain', 3)]);
    const state = { ...startSession(config()), drawn: [] as string[] };
    for (let i = 0; i < 30; i++) {
      const res = draw(deck, state, mulberry32(i + 1));
      expect(res.card?.id).toBe('plain');
    }
  });

  it('includes them once the prop is available', () => {
    const deck = makeDeck([makeCard('needs', 3, ['blindfold'])]);
    const state = {
      ...startSession(config({ availableProps: ['blindfold'] })),
      drawn: [] as string[],
    };
    expect(draw(deck, state, mulberry32(1)).card?.id).toBe('needs');
  });
});

describe('ladder actually climbs (regression: it was capped at tier 1 forever)', () => {
  it('reaches the ceiling over a full session rather than stalling at tier 1', () => {
    const cards: Card[] = [];
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 6; i++) cards.push(makeCard(`t${tier}-${i}`, tier as Tier));
    }
    const deck = makeDeck(cards);
    const rng = mulberry32(3);
    let state = {
      ...startSession(config({ ladder: true, ladderStep: 3, maxTier: 5 })),
      drawn: [] as string[],
    };

    const tiers = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const res = draw(deck, state, rng);
      if (!res.card) break;
      tiers.add(res.card.tier);
      state = res.state;
    }

    // The whole point of the ladder is that it MOVES. Seeing only tier 1 over
    // 25 draws is the bug this test exists for.
    expect(Math.max(...tiers)).toBe(5);
    expect(tiers.size).toBeGreaterThan(1);
  });
});

describe('ladder clock survives pool recycling (regression)', () => {
  it('keeps climbing even when a small tier pool exhausts and recycles', () => {
    // Only ONE tier-1 card, so the tier-1 pool recycles on the second draw.
    // If the ladder clock were drawn.length, recycling would reset it to 1 and
    // the session would be stuck at tier 1 forever.
    const cards: Card[] = [makeCard('easy', 1)];
    for (let t = 2; t <= 5; t++) {
      for (let i = 0; i < 4; i++) cards.push(makeCard(`t${t}-${i}`, t as Tier));
    }
    const deck = makeDeck(cards);
    const rng = mulberry32(11);
    let state = {
      ...startSession(config({ ladder: true, ladderStep: 2, maxTier: 5 })),
      drawn: [] as string[],
    };

    const seenTiers = new Set<number>();
    for (let i = 0; i < 16; i++) {
      const res = draw(deck, state, rng);
      if (!res.card) break;
      seenTiers.add(res.card.tier);
      state = res.state;
    }
    expect(Math.max(...seenTiers)).toBe(5);
    expect(state.drawCount).toBe(16);
  });
});

describe('turn ownership', () => {
  it('drawing does NOT advance the turn, so a skip stays with the same person', () => {
    const deck = makeDeck([makeCard('a', 1), makeCard('b', 1), makeCard('c', 1)]);
    let state = { ...startSession(config()), drawn: [] as string[] };
    expect(state.turn).toBe('a');

    // Three consecutive draws, as a person skipping twice then keeping the third.
    for (let i = 0; i < 3; i++) {
      const res = draw(deck, state, mulberry32(i + 1));
      state = res.state;
      expect(state.turn).toBe('a');
    }
  });

  it('nextTurn alternates and is the only thing that does', () => {
    let state = { ...startSession(config()), drawn: [] as string[] };
    expect(state.turn).toBe('a');
    state = nextTurn(state);
    expect(state.turn).toBe('b');
    state = nextTurn(state);
    expect(state.turn).toBe('a');
  });
});

describe('currentTier', () => {
  it('reports the tier a draw would actually use, not the ceiling', () => {
    const cfg = config({ ladder: true, ladderStep: 3, maxTier: 5 });
    const state = { ...startSession(cfg), drawn: [] as string[] };
    // effectiveTier is the CEILING and stays at 5; the ladder position is what
    // starts at 1 and climbs with progress.
    expect(state.effectiveTier).toBe(5);
    expect(currentTier(state)).toBe(1);
    expect(currentTier({ ...state, drawCount: 3 })).toBe(2);
    expect(currentTier({ ...state, drawCount: 30 })).toBe(5);
  });

  it('never exceeds a ceiling lowered by yellow', () => {
    const cfg = config({ ladder: true, ladderStep: 1, maxTier: 5 });
    let state = { ...startSession(cfg), drawCount: 20 };
    state = applyLight(state, 'yellow');
    state = applyLight(state, 'yellow');
    expect(currentTier(state)).toBeLessThanOrEqual(state.effectiveTier);
  });

  it('is just the ceiling when the ladder is off', () => {
    const state = { ...startSession(config({ maxTier: 4 })), drawn: [] as string[] };
    expect(currentTier(state)).toBe(4);
  });
});

describe('poolProgress', () => {
  it('counts only cards inside the eligible pool', () => {
    const deck = makeDeck([makeCard('a', 1), makeCard('b', 1), makeCard('hot', 5)]);
    const state = {
      ...startSession(config({ maxTier: 1 })),
      drawn: ['a', 'hot'] as string[],
    };
    // 'hot' is above the ceiling so it is not part of the pool being tracked.
    expect(poolProgress(deck, state)).toEqual({ seen: 1, total: 2 });
  });
});

describe('recycling is scoped to the exhausted pool (regression)', () => {
  it('does not wipe history for cards outside the pool that ran out', () => {
    // Two disjoint groups, as a split deck produces when each draw is scoped to
    // one half. Exhausting group A must not forget group B.
    const groupA = [makeCard('a1', 1), makeCard('a2', 1)];
    const groupB = [makeCard('b1', 1), makeCard('b2', 1), makeCard('b3', 1)];
    const deckA = makeDeck(groupA);
    const rng = mulberry32(5);

    // Pretend group B has already been seen this session.
    let state = {
      ...startSession(config()),
      drawn: groupB.map((c) => c.id),
      drawCount: 3,
    };

    // Draw group A dry, then once more to force a recycle.
    state = draw(deckA, state, rng).state;
    state = draw(deckA, state, rng).state;
    const recycled = draw(deckA, state, rng);

    expect(recycled.recycled).toBe(true);
    for (const c of groupB) {
      expect(recycled.state.drawn).toContain(c.id);
    }
    // And group A's history is down to just the card it re-drew.
    expect(recycled.state.drawn.filter((id) => id.startsWith('a'))).toHaveLength(1);
  });
});

describe('playable', () => {
  /**
   * The engines that do not run a full session (compare, scale, predict,
   * ladder, endurance, builder) each filtered with a bare tier comparison and
   * so ignored props entirely. A card needing a blindfold could be dealt to two
   * people who had said they did not have one, which is a promise broken in the
   * one place the app asks you to trust it.
   */
  it('drops anything above the ceiling', () => {
    const items = [makeCard('a', 1), makeCard('b', 4)];
    expect(playable(items, 2, []).map((c) => c.id)).toEqual(['a']);
  });

  it('drops a card needing something you do not have', () => {
    const items = [makeCard('a', 1), makeCard('b', 1, ['blindfold'])];
    expect(playable(items, 5, []).map((c) => c.id)).toEqual(['a']);
    expect(playable(items, 5, ['blindfold']).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('needs EVERY prop a card asks for, not just one', () => {
    const items = [makeCard('a', 1, ['blindfold', 'ice'])];
    expect(playable(items, 5, ['blindfold'])).toHaveLength(0);
    expect(playable(items, 5, ['blindfold', 'ice'])).toHaveLength(1);
  });

  it('works on slot options, which are not Cards', () => {
    const options = [
      { text: 'plain', tier: 3 as Tier },
      { text: 'cold', tier: 3 as Tier, props: ['ice'] },
    ];
    expect(playable(options, 5, []).map((o) => o.text)).toEqual(['plain']);
  });
});

describe('propsUsed', () => {
  /**
   * The settings screen is built from this. Deriving the list from the content
   * is what stops the app offering a toggle for an item nothing requires, which
   * would be a control that silently does nothing while the guardrail panel
   * claims filtering that is not happening.
   */
  it('names every prop the content asks for, once, sorted', () => {
    const deck = makeDeck([
      makeCard('a', 1, ['ice']),
      makeCard('b', 1, ['blindfold']),
      makeCard('c', 1, ['ice']),
      makeCard('d', 1),
    ]);
    expect(propsUsed([deck])).toEqual(['blindfold', 'ice']);
  });

  it('sees props on builder slot options too', () => {
    const deck = {
      ...makeDeck([]),
      slotDefs: [{ key: 'how', label: 'how', options: [{ text: 'x', tier: 3, props: ['ice'] }] }],
    };
    expect(propsUsed([deck])).toEqual(['ice']);
  });

  it('returns nothing when no card needs anything', () => {
    expect(propsUsed([makeDeck([makeCard('a', 1)])])).toEqual([]);
  });
});
