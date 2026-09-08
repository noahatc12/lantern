import type { Card, Deck, SessionConfig, SessionState, Tier } from '../types';
import { isStringArray, read, write } from './storage';

/**
 * Draw logic.
 *
 * Two rules do most of the work for how a session feels:
 *   1. Never repeat a card until the eligible pool is exhausted. Drawing the
 *      same dare twice in one night ends the session faster than a bad card.
 *   2. Never draw above the effective tier. Yellow lowers that mid-session, so
 *      the ceiling is read live rather than captured when the session starts.
 */

/** Deterministic PRNG so a seed reproduces a session exactly, for tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Cards playable given the live ceiling and the props actually on hand. */
export function eligible(deck: Deck, state: SessionState): Card[] {
  return deck.cards.filter((card) => {
    if (card.tier > state.effectiveTier) return false;
    if (card.props && card.props.length > 0) {
      const have = new Set(state.config.availableProps);
      if (!card.props.every((p) => have.has(p))) return false;
    }
    return true;
  });
}

/**
 * With the ladder on, a session opens at tier 1 and steps up every
 * ladderStep draws, capped by the configured ceiling. Opening a session at
 * maximum heat is the single most reliable way to kill it.
 */
export function ladderTier(config: SessionConfig, drawCount: number): Tier {
  if (!config.ladder) return config.maxTier;
  const step = Math.max(1, config.ladderStep);
  const climbed = Math.floor(drawCount / step) + 1;
  return Math.min(climbed, config.maxTier) as Tier;
}

export interface DrawResult {
  card: Card | null;
  state: SessionState;
  /** True when the pool was exhausted and the seen-history was cleared. */
  recycled: boolean;
}

export function draw(deck: Deck, state: SessionState, rng: () => number): DrawResult {
  if (state.light === 'red') return { card: null, state, recycled: false };

  const tier = state.config.ladder
    ? (Math.min(ladderTier(state.config, state.drawCount), state.effectiveTier) as Tier)
    : state.effectiveTier;

  const scoped: SessionState = { ...state, effectiveTier: tier };
  const pool = eligible(deck, scoped);
  if (pool.length === 0) return { card: null, state, recycled: false };

  const seen = new Set(state.drawn);
  let unseen = pool.filter((c) => !seen.has(c.id));
  let recycled = false;

  if (unseen.length === 0) {
    // Pool exhausted. Clear history for these cards rather than refusing to
    // draw, so a long session degrades into repeats instead of a dead end.
    unseen = pool;
    recycled = true;
  }

  const picked = shuffle(unseen, rng)[0] as Card;

  // On recycle, clear ONLY the ids belonging to the pool that ran out. Resetting
  // the whole history wiped unrelated cards: a split deck scopes each draw to
  // one half, so the smaller half exhausting erased the larger half's history
  // and cards started repeating while plenty were still unseen. The soak caught
  // it at draw 102 of 120.
  const poolIds = new Set(pool.map((c) => c.id));
  const drawn = recycled
    ? [...state.drawn.filter((id) => !poolIds.has(id)), picked.id]
    : [...state.drawn, picked.id];

  // Turn is NOT advanced here. Drawing and taking a turn are different events:
  // a skip draws a replacement card for the SAME person, and folding the turn
  // flip into draw() made skipping silently hand the phone over.
  return {
    card: picked,
    state: { ...state, drawn, drawCount: state.drawCount + 1 },
    recycled,
  };
}

/** Advance to the other player. Called when a turn is actually finished. */
export function nextTurn(state: SessionState): SessionState {
  return { ...state, turn: state.turn === 'a' ? 'b' : 'a' };
}

/**
 * The tier a draw would actually use right now. With the ladder on this is
 * below the ceiling early in a session, so showing effectiveTier in the UI
 * reads as "tier 5" while tier 1 cards are being drawn.
 */
export function currentTier(state: SessionState): Tier {
  if (!state.config.ladder) return state.effectiveTier;
  return Math.min(ladderTier(state.config, state.drawCount), state.effectiveTier) as Tier;
}

/** Yellow drops one tier and never goes below 1. Red ends the session. */
export function applyLight(state: SessionState, light: TrafficLightInput): SessionState {
  if (light === 'red') return { ...state, light: 'red' };
  if (light === 'yellow') {
    const lowered = Math.max(1, state.effectiveTier - 1) as Tier;
    return { ...state, light: 'yellow', effectiveTier: lowered };
  }
  return { ...state, light: 'green' };
}

type TrafficLightInput = 'green' | 'yellow' | 'red';

export function startSession(config: SessionConfig): SessionState {
  return {
    config,
    // The CEILING, not the ladder position. Initialising this to 1 for ladder
    // decks capped every session at tier 1 permanently, because nothing ever
    // raised it while draw() took min(ladderPosition, effectiveTier). The
    // ladder position is derived from progress; the ceiling is set by the
    // players and only ever lowered, by yellow.
    effectiveTier: config.maxTier,
    drawn: read<string[]>(`seen.${config.deckId}`, [], isStringArray),
    drawCount: 0,
    turn: 'a',
    light: 'green',
    startedAt: Date.now(),
  };
}

export function persistSeen(state: SessionState): void {
  write(`seen.${state.config.deckId}`, state.drawn);
}

/** Clears the no-repeat history so a deck plays fresh. */
export function resetSeen(deckId: string): void {
  write(`seen.${deckId}`, []);
}

/** How much of the eligible pool has been seen, for a progress readout. */
export function poolProgress(deck: Deck, state: SessionState): { seen: number; total: number } {
  const pool = eligible(deck, { ...state, effectiveTier: state.effectiveTier });
  const ids = new Set(pool.map((c) => c.id));
  return { seen: state.drawn.filter((id) => ids.has(id)).length, total: pool.length };
}
