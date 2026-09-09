/** Tier 1 is safe anywhere; tier 5 has no ceiling. Sessions set a maximum. */
export type Tier = 1 | 2 | 3 | 4 | 5;

export type EngineId =
  | 'draw'
  | 'predict'
  | 'compare'
  | 'match'
  | 'scale'
  | 'timer'
  | 'ladder'
  | 'builder'
  | 'vault'
  | 'endurance'
  | 'leader'
  | 'quiz'
  | 'authored'
  | 'relay'
  | 'staged'
  | 'story'
  | 'bodymap'
  | 'ordered';

export type Player = 'a' | 'b';

export interface Card {
  id: string;
  text: string;
  tier: Tier;
  /** Who acts on this card. Omitted means whoever holds the phone. */
  target?: 'self' | 'partner' | 'both';
  /** Physical items required. Filtered out when the player does not have them. */
  props?: string[];
  /** Free-form bucket used by engines that need more than text, e.g. builder slots. */
  slots?: Record<string, string[]>;
}

export interface DeckRules {
  summary?: string;
  steps?: string[];
  example?: { label: string; lines: string[] };
  notes?: string[];
}

export interface Deck {
  id: string;
  title: string;
  blurb: string;
  engine: EngineId;
  /**
   * Per-deck how-to-play, overriding the engine's. Several games share an
   * engine while being different games, and the engine's own rules can only
   * describe one of them.
   */
  rules?: DeckRules;
  tierRange: [Tier, Tier];
  tags: string[];
  duration: 'short' | 'medium' | 'long';
  /** True only for decks holding gated content. Off by default everywhere. */
  optIn?: boolean;
  cards: Card[];
}

export interface SessionConfig {
  deckId: string;
  /** Hard ceiling. No card above this is ever drawn. */
  maxTier: Tier;
  /** Cards needing props the players do not have are excluded. */
  availableProps: string[];
  /** Ramp from tier 1 upward instead of opening at the ceiling. */
  ladder: boolean;
  ladderStep: number;
}

/**
 * Yellow lowers the ceiling for the rest of the session. Red ends it.
 * Neither ever records which player triggered it. That is a requirement, not a
 * UI preference: the whole point is that using it costs nothing socially.
 */
export type TrafficLight = 'green' | 'yellow' | 'red';

export interface SessionState {
  config: SessionConfig;
  /**
   * The session CEILING, which yellow can lower below config.maxTier.
   * This is not the ladder position: with the ladder on, the tier a draw
   * actually uses is min(ladderPosition, effectiveTier). See currentTier().
   */
  effectiveTier: Tier;
  /** No-repeat history. RESET when the pool recycles, so it is not a clock. */
  drawn: string[];
  /**
   * Monotonic count of draws this session. Separate from `drawn` on purpose:
   * `drawn` is cleared when the pool recycles, and using it as the ladder clock
   * meant a small tier-1 pool exhausting would reset the ladder to step one,
   * so a session could never climb out of tier 1.
   */
  drawCount: number;
  turn: Player;
  light: TrafficLight;
  startedAt: number;
}
