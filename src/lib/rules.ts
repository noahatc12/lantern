import type { EngineId } from '../types';

/**
 * How to play, per engine.
 *
 * Keyed by ENGINE rather than by deck, for two reasons: this file ships in a
 * public repo, so engine-level mechanics reveal nothing while per-deck rules
 * would; and rules living in code rather than deck data means editing them
 * never requires resealing the content bundle.
 *
 * The division of labour: these rules explain the MECHANIC. The deck's own
 * prompt, which comes from the sealed bundle, supplies the SUBJECT. Every
 * engine whose rules depend on a subject says so explicitly, so a player is
 * never left guessing what a blank field wants.
 */

export interface Rules {
  summary: string;
  steps: string[];
  /** A worked example. Concrete beats abstract, especially for authored games. */
  example?: { label: string; lines: string[] };
  notes: string[];
}

export const RULES: Record<EngineId, Rules> = {
  draw: {
    summary: 'Take turns. Pick a category, do what the card says, hand the phone over.',
    steps: [
      'The screen names whose turn it is.',
      'That person picks a category, and the app draws one card.',
      'Answer it out loud, or do it.',
      'Tap Done to pass the phone. Tap Skip if you want a different card instead.',
    ],
    example: {
      label: 'A round looks like',
      lines: [
        'Screen says: Noah. Noah taps truth.',
        'Card: "What was the first thing you noticed about me?"',
        'Noah answers, taps Done, hands the phone to Lily.',
      ],
    },
    notes: [
      'Skipping is free. It does not use your turn, and the other person is never told you skipped.',
      'The deck warms up on its own: early cards are easy and it climbs as you play, so it cannot open at full intensity.',
      'No card repeats until the whole deck has been through once.',
    ],
  },

  match: {
    summary: 'Sort the deck alone. Only what you BOTH said yes to comes back.',
    steps: [
      'One of you takes the phone to another room and sorts every card No, Maybe or Yes.',
      'The screen goes blank. Hand the phone over without looking.',
      'The other person sorts the same deck, seeing none of the first answers.',
      'The app shows what you both wanted, and nothing else.',
    ],
    example: {
      label: 'How the reveal works',
      lines: [
        'You said Yes, they said Yes  ->  shown under Both yes',
        'You said Yes, they said Maybe  ->  shown under Worth talking about',
        'You said Yes, they said No  ->  never shown, to either of you',
      ],
    },
    notes: [
      'Anything either of you said No to is never displayed and never written to the phone. It stops existing the moment the match runs.',
      'That is the whole point. You can say yes to something without risking that it lands badly, because a solo yes is never revealed.',
      'Sort it alone. Doing this with the other person watching defeats the entire mechanic.',
    ],
  },

  predict: {
    summary:
      'Write three statements about yourself. Two are true but boring. One is the real answer to the prompt. They guess which.',
    steps: [
      'Read the prompt. It tells you what the real one should be about, and it stays on screen while you write.',
      'Write three lines. Two should be true and unremarkable. One is your real answer to the prompt.',
      'Tap mark on the real one. The mark is never shown to the other person.',
      'The screen goes blank. Hand the phone over. They guess which line is the real answer.',
      'The real one is revealed. Ask one follow-up question about it, then swap and they write.',
    ],
    example: {
      label: 'A worked example',
      lines: [
        'Say the prompt asked for something you have never told them.',
        '1. I once ate cereal for dinner four nights running.',
        '2. I still know every word of a song I pretend to hate.',
        '3. [the real answer, whatever the prompt is actually asking for]',
        'Then you would mark line 3.',
      ],
    },
    notes: [
      'The two decoys should be true and dull. If they are obviously filler, the real one stands out and the game does nothing.',
      'Put the real one in a different position each round or they will learn your pattern.',
      'Make the real one something you actually mean. A joke answer wastes the round.',
      'The guess is not the point. The follow-up question is. Nothing you write is saved anywhere.',
    ],
  },

  timer: {
    summary: 'A clock and an instruction that changes as it runs. Do not stop early.',
    steps: [
      'Put the phone somewhere you can both see it.',
      'Start the clock.',
      'Do what the instruction on screen says.',
      'The instruction changes on its own as time passes. Follow the new one.',
      'Stop when the clock does, not before.',
    ],
    example: {
      label: 'A five minute run',
      lines: [
        '0:00  start slow, slower than feels natural',
        '1:00  hands stay where they are',
        '2:00  stop completely for fifteen seconds',
        'and so on until the clock ends',
      ],
    },
    notes: [
      'Running the clock out is the mechanic. Ending early is the exact thing this is built to prevent, which is why there is no pause.',
      'It will feel much longer than it is. That is expected, and the last minute is where anything actually happens.',
    ],
  },

  ladder: {
    summary:
      'Rungs that escalate one step at a time. Both of you opt in before each one. Either of you can stop the whole thing.',
    steps: [
      'Each rung asks both of you to tap in before it is revealed.',
      'One person tapping in is not enough. Nothing shows until both have.',
      'The rung appears. Do it.',
      'Tap Next rung to continue, or Enough to end the game there.',
    ],
    example: {
      label: 'The rungs climb',
      lines: [
        'Rung 1 is trivial and low stakes.',
        'Each rung after asks for a little more than the last.',
        'The final rung is the real one.',
      ],
    },
    notes: [
      'Stopping is not losing. The end screen shows how far you got and nothing else.',
      'The app never records who ended it. Not on screen, not in storage, ever.',
      'Consent here is not one decision at the start. It is a fresh one at every single rung.',
    ],
  },

  // Specced but not yet built. Listed so the map stays exhaustive and adding an
  // engine is a compile error until its instructions are written.
  compare: {
    summary: 'You both answer the same question privately, then both answers appear together.',
    steps: [
      'Answer the question privately.',
      'Hand the phone over. They answer the same question.',
      'Both answers are shown side by side.',
    ],
    notes: ['Nothing is scored. Where the answers differ is the interesting part.'],
  },
  scale: {
    summary: 'You both rate the same thing. The app shows the gap before the numbers.',
    steps: ['Rate it privately.', 'Hand over. They rate it.', 'The gap is revealed, then the numbers.'],
    notes: ['A gap of four or more is worth one sentence each. That is the whole game.'],
  },
  builder: {
    summary: 'The app assembles a prompt out of parts. Reroll anything that does not fit.',
    steps: ['Roll.', 'Either of you can veto or reroll any part.', 'Do what it says.'],
    notes: ['A few dozen parts make hundreds of combinations, so it rarely repeats.'],
  },
  vault: {
    summary: 'Write a promise now. Redeem it whenever you want.',
    steps: ['Write what is owed and by whom.', 'It sits in the vault.', 'Redeem it any time.'],
    notes: ['A phone remembers an IOU three weeks later, which is exactly why paper coupon books fail.'],
  },
  endurance: {
    summary: 'Whoever reacts first loses. Restraint is the whole game.',
    steps: ['Take turns within the drawn constraint.', 'First one to ask for more loses.'],
    notes: ['Losing is fine. The winner decides what happens next.'],
  },
};
