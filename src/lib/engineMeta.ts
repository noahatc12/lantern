import type { EngineId, Tier } from '../types';

/**
 * Per-engine visual identity, and the grouping the home screen uses.
 *
 * A flat list of 29 identical rectangles reads as a database rather than a
 * shelf of games. Two cheap fixes: a coloured spine so engines are
 * distinguishable at a glance, and sections so the list answers the question
 * people actually arrive with, which is "what can we play right now".
 *
 * Grouped by opening tier rather than by engine, because that is the axis a
 * couple picks along. Nobody has ever thought "I want a Scale game tonight".
 */

/**
 * What each tier means, in words.
 *
 * Four screens had their own copy of this. Four copies of a safety vocabulary
 * is three chances for the ceiling to be described one way on the screen where
 * you set it and another on the screen where it applies.
 */
export const TIER_LABEL: Record<Tier, string> = {
  1: 'anywhere',
  2: 'personal',
  3: 'flirty',
  4: 'explicit',
  5: 'no limit',
};

export const ENGINE_COLOR: Record<EngineId, string> = {
  draw: '#e8b64c',
  match: '#74cf90',
  compare: '#7fa6e8',
  predict: '#b38ce0',
  scale: '#5fc4c0',
  timer: '#e8935c',
  ladder: '#e07f9d',
  builder: '#6fc0dd',
  vault: '#d4b06a',
  endurance: '#e26b6b',
};

export interface Band {
  key: string;
  label: string;
  hint: string;
  /** Opening tiers that belong in this band. */
  tiers: Tier[];
}

export const BANDS: Band[] = [
  {
    key: 'easy',
    label: 'Easy to start',
    hint: 'Nothing here needs the door shut.',
    tiers: [1, 2],
  },
  {
    key: 'flirty',
    label: 'Flirty',
    hint: 'Clothes stay on, mostly.',
    tiers: [3],
  },
  {
    key: 'explicit',
    label: 'Explicit',
    hint: 'Set the ceiling together first.',
    tiers: [4, 5],
  },
];

export function bandFor(openingTier: Tier): Band {
  return BANDS.find((b) => b.tiers.includes(openingTier)) ?? BANDS[BANDS.length - 1]!;
}
