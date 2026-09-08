import type { EngineId } from '../types';

/**
 * How to play, per engine.
 *
 * Deliberately keyed by ENGINE rather than by deck. Two reasons:
 *
 *  1. This file ships in a public repo. Engine-level instructions are generic
 *     and reveal nothing; per-deck rules would leak what the decks are.
 *  2. Rules living in code rather than in deck data means editing them never
 *     requires resealing the content bundle.
 *
 * Each deck still supplies its own one-line blurb from the sealed bundle, so a
 * player sees generic mechanics plus that deck's specific framing.
 */

export interface Rules {
  /** One line on what this is. */
  summary: string;
  /** Numbered steps, in play order. */
  steps: string[];
  /** The things that make it work, or ruin it. */
  notes: string[];
}

export const RULES: Record<EngineId, Rules> = {
  draw: {
    summary: 'Take turns. Pick your poison, do the thing, hand the phone over.',
    steps: [
      'The screen names whose turn it is.',
      'That person picks a category, and the app draws a card.',
      'Answer it or do it.',
      'Tap Done to pass. Tap Skip to get a different card instead.',
    ],
    notes: [
      'Skipping is free. It costs no turn, no points, and the other person is never told you skipped.',
      'The deck warms up on its own. Early cards stay easy and it climbs as you play, so opening at the ceiling is not possible.',
      'No card repeats until the whole deck has been through.',
    ],
  },

  match: {
    summary: 'Sort the deck alone. Only what you BOTH said yes to comes back.',
    steps: [
      'One of you takes the phone somewhere private and sorts every card No, Maybe or Yes.',
      'The screen goes blank. Hand the phone over.',
      'The other person sorts the same deck, without seeing the first answers.',
      'The app shows what you both wanted, and nothing else.',
    ],
    notes: [
      'Anything either of you said No to is never shown to anyone, and is never written to the phone. It stops existing the moment the match runs.',
      'That is the whole point: you can say yes to something without risking that it lands badly, because a solo yes is never revealed.',
      'Take it to another room. Sorting with the other person watching defeats it.',
    ],
  },

  predict: {
    summary: 'Write three. One is true. See if they can pick it.',
    steps: [
      'One of you writes three statements privately and marks which one is real.',
      'The screen goes blank. Hand the phone over.',
      'The other person guesses which is the real one.',
      'The real one is revealed. Ask one follow-up question about it, then swap.',
    ],
    notes: [
      'Make the real one something you actually mean. A joke answer makes the round do nothing.',
      'The guess is not the point. The follow-up question is.',
      'Nothing you write is saved anywhere.',
    ],
  },

  timer: {
    summary: 'A clock and a changing instruction. Do not stop early.',
    steps: [
      'Put the phone down where you can both see it.',
      'Start the timer.',
      'Follow the instruction on screen. It changes as the clock runs.',
      'Stop when the timer does, not before.',
    ],
    notes: [
      'Running the clock out is the mechanic. Ending early is the thing this is designed to prevent.',
      'It will feel much longer than it is. That is expected, and the last minute is where anything happens.',
    ],
  },

  ladder: {
    summary: 'Rungs that escalate. Both of you opt in to each one. Either can stop.',
    steps: [
      'Each rung asks both of you to opt in before it is shown.',
      'Both tap in, and the rung appears.',
      'Do it, then move to the next rung.',
      'Anyone can tap Enough at any point, and the game ends there.',
    ],
    notes: [
      'Stopping is not losing. The end screen shows how far you got and nothing else.',
      'The app never records who ended it. Not on screen, not in storage.',
      'Consent here is not one decision at the start. It is a fresh one at every rung.',
    ],
  },

  // Engines specced but not yet built. Listed so the map stays exhaustive and
  // adding one is a compile error until its rules are written.
  compare: {
    summary: 'Both answer privately, then both answers are shown side by side.',
    steps: ['Answer privately.', 'Hand the phone over.', 'They answer.', 'Both answers appear.'],
    notes: ['Nothing is scored. The gaps between the answers are the interesting part.'],
  },
  scale: {
    summary: 'Both rate the same thing. The app shows the gap first.',
    steps: ['Rate it privately.', 'Hand over.', 'They rate it.', 'The gap is revealed.'],
    notes: ['A big gap is worth a sentence each. That is the whole game.'],
  },
  builder: {
    summary: 'The app assembles a prompt from parts. Reroll anything that does not fit.',
    steps: ['Roll.', 'Either of you can veto or reroll a part.', 'Do what it says.'],
    notes: ['A few dozen parts make hundreds of combinations, so it rarely repeats.'],
  },
  vault: {
    summary: 'Write a promise now. Redeem it whenever you like.',
    steps: ['Write what is owed.', 'It sits in the vault.', 'Redeem it any time.'],
    notes: ['A phone remembers an IOU three weeks later, which is why paper coupon books fail.'],
  },
  endurance: {
    summary: 'Whoever reacts first loses. Restraint is the game.',
    steps: ['Take turns.', 'Stay within the drawn constraint.', 'First to ask for more loses.'],
    notes: ['Losing is fine. The winner decides what happens next.'],
  },
};
