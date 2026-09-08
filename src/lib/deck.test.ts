import { describe, expect, it } from 'vitest';
import { applyLight, draw, ladderTier, mulberry32, shuffle, startSession } from './deck';
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
