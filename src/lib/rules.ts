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
 *
 * A deck may override any of it. Several games share an engine while being
 * different games: Utter Silence and First to Break both run on endurance, and
 * the endurance rules below describe First to Break specifically, so without an
 * override one of the two would open on instructions for the other. The
 * override lives in the deck, which means it ships encrypted like every other
 * piece of content and reveals nothing here.
 */

export interface Rules {
  summary: string;
  steps: string[];
  /** A worked example. Concrete beats abstract, especially for authored games. */
  example?: { label: string; lines: string[] };
  notes: string[];
}

/** What a deck may override. Anything omitted falls back to its engine. */
export type RulesOverride = Partial<Rules>;

/**
 * The rules a given deck should show: its engine's, with anything the deck
 * states for itself taking precedence.
 */
export function rulesFor(deck: { engine: EngineId; rules?: RulesOverride }): Rules {
  const base = RULES[deck.engine];
  return deck.rules ? { ...base, ...deck.rules } : base;
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
    summary:
      'You both answer the same question privately, then both answers are shown together.',
    steps: [
      'The question appears. One of you answers it privately and taps done.',
      'The screen goes blank. Hand the phone over.',
      'The other person answers the same question, without seeing the first answer.',
      'Both answers appear side by side. Talk about them, then move on.',
    ],
    example: {
      label: 'A worked example',
      lines: [
        'Question: "Where are we living in five years?"',
        'One of you writes a city. The other writes a different city.',
        'That gap is the entire reason to run this.',
      ],
    },
    notes: [
      'Nothing is scored and nothing is saved. Where the answers differ is the point, not who is right.',
      'Write what you actually think, not what you expect them to want to read. A matched pair of polite answers teaches you nothing.',
      'Some decks are in a fixed order because they build. Do not skip ahead in those.',
    ],
  },
  scale: {
    summary: 'You both rate the same thing 0 to 10. The app shows the GAP before it shows the numbers.',
    steps: [
      'A scenario appears. One of you rates it 0 to 10 privately.',
      'The screen goes blank. Hand the phone over. They rate the same one.',
      'The distance between your two numbers is shown first.',
      'Tap again to see the actual numbers.',
    ],
    example: {
      label: 'A worked example',
      lines: [
        '0 means not for me. 10 means yes, tonight.',
        'You said 9, they said 3. The app shows "6 apart" first.',
        'A gap that size is worth one sentence each on why.',
      ],
    },
    notes: [
      'The gap shows first on purpose. Numbers first turns it into who wanted it more; distance first keeps it on the difference, which is the only part you can act on.',
      'Two 8s and two 4s are both agreement, and they are not the same thing. That is what a scale tells you and a yes/no cannot.',
    ],
  },
  builder: {
    summary: 'The app rolls a prompt out of separate parts. Reroll any part that does not fit.',
    steps: [
      'Tap roll. Each part is drawn independently.',
      'Reroll any single part you do not want. Either of you can, without explaining.',
      'Do what the assembled prompt says.',
      'Roll again for the next one.',
    ],
    example: {
      label: 'A worked example',
      lines: [
        'where: back of the neck',
        'how: fingertips only',
        'for how long: until they ask for more',
      ],
    },
    notes: [
      'Reroll one part rather than the whole thing. Throwing away the two parts that were fine is why people stop rerolling and start accepting prompts they did not want.',
      'A few dozen options make well over a thousand combinations, so it will not repeat on you.',
    ],
  },
  vault: {
    summary: 'Write down something one of you owes the other. Redeem it whenever you feel like it.',
    steps: [
      'Tap to write a new one. Choose who owes it, and say specifically what.',
      'Optionally seal it, so it cannot be opened for a set number of days.',
      'It sits in the vault until someone redeems it.',
      'Tap redeem when it is cashed in. That cannot be undone.',
    ],
    example: {
      label: 'A worked example',
      lines: [
        'Noah owes: a full hour, no phones, doing whatever Lily picks.',
        'It sits there for three weeks.',
        'Lily taps redeem on a Tuesday for no reason.',
      ],
    },
    notes: [
      'Be specific. "A massage" is redeemable; "something nice" never gets cashed.',
      'This is the one thing a phone does better than paper: it still remembers three weeks later, which is exactly why paper coupon books fail.',
      'Delete removes it permanently and immediately. There is no bin.',
    ],
  },
  endurance: {
    summary: 'Take turns. Whoever asks for more first loses, and losing is the good outcome.',
    steps: [
      'A constraint is drawn. Whoever is active has to stay inside it.',
      'Two minutes each, then swap.',
      'The moment the receiving one asks for more, tap the button and the game ends.',
      'The winner decides what happens next.',
    ],
    example: {
      label: 'A worked example',
      lines: [
        'Constraint: hands only, no mouth.',
        'Two minutes on, then swap, then a new constraint.',
        'Whoever breaks first hands the decision to the other one.',
      ],
    },
    notes: [
      'This inverts the usual incentive. Normally escalating is the goal; here holding back is, and the tension does the work.',
      'Losing is not a punishment. It is how the game ends and it is the better half of the deal.',
      'If nobody breaks inside the cap it is a draw, which is a real outcome and not a failure.',
    ],
  },

  leader: {
    summary: 'One of you holds the role for the whole round, not just a turn.',
    steps: [
      'The app names who is leading and hands them a command to read out.',
      'The other one either does it or does not, by the deck’s rule.',
      'Tap Done, next if they obeyed. Tap the other one if they slipped.',
      'The role changes hands when the round ends or the misses run out.',
    ],
    example: {
      label: 'Why the role is fixed',
      lines: [
        'Every other game here swaps every turn, which is fair.',
        'A role that changes hands every thirty seconds is not a role.',
        'This one stays put long enough to be one.',
      ],
    },
    notes: [
      'The app is doing the asking, which is the entire point. Reading a line off a screen is far easier than saying it, and it is still your voice saying it.',
      'Misses are not scored past the round. Nothing about who missed what is written down.',
      'Whoever is leading can drop a command without reading it. Nobody has to explain a pass.',
    ],
  },

  quiz: {
    summary: 'One of you answers as the other, then finds out how close you were.',
    steps: [
      'A question comes up about one of you.',
      'The other answers it as they think that person would, and locks it in.',
      'Then the real answer goes in, and both are shown side by side.',
      'The end screen lists only the ones you got wrong.',
    ],
    example: {
      label: 'What you are playing for',
      lines: [
        'A hit tells you something you already knew.',
        'A miss is a thing neither of you knew you disagreed about.',
        'The misses are the output. The score is just there to make it a game.',
      ],
    },
    notes: [
      'Close enough counts. Whoever the question was about decides, and it is not a spelling test.',
      'Nothing is written down: not the answers, not the score, not who missed what. It exists on screen and then it is gone.',
      'A high score is the boring outcome. If you get everything right, the questions were too easy.',
    ],
  },

  authored: {
    summary: 'You write the content. The app only holds it, and takes the name off.',
    steps: [
      'Take the phone somewhere else and write yours, privately.',
      'Hand it over. They write theirs without seeing yours.',
      'Both sets get mixed together into one pile.',
      'What comes out has no name on it unless somebody taps to see it.',
    ],
    example: {
      label: 'Why nobody signs them',
      lines: [
        'You can put something in without being the one who asked for it.',
        'If it lands badly, nobody has to own it.',
        'That is the same protection the sorting games give, applied to your own words.',
      ],
    },
    notes: [
      'Two people and a short list is not real anonymity. Phrasing gives you away. Treat it as deniability rather than secrecy and it still does its job.',
      'Be specific. A vague one never gets drawn and done; a specific one does.',
      'Delete removes it from the phone immediately. This is your writing, so it is the one place that has to be true.',
    ],
  },

  relay: {
    summary: 'One sentence each, passing the phone, until there is a whole story.',
    steps: [
      'The app gives you an opening line.',
      'Add one sentence, then hand the phone over.',
      'You can only see the last two sentences, so nobody edits backwards.',
      'At the end you read the whole thing and decide whether to keep it.',
    ],
    example: {
      label: 'Why one sentence',
      lines: [
        'One sentence is nothing to write, so neither of you stalls.',
        'And neither of you gets to decide alone what the story is.',
        'What comes out is usually better than either would have written.',
      ],
    },
    notes: [
      'There is a character cap and it is doing real work. One person writing paragraphs turns this into an audience.',
      'Until you tap Keep it exists only on the screen. Nothing is written down as you go.',
      'Delete means gone from the phone, not hidden.',
    ],
  },

  staged: {
    summary: 'Stages unlocked in order, one per sitting, over weeks.',
    steps: [
      'One stage per sitting. The next does not open until you have both marked this one done.',
      'The app runs the clock and calls the swap.',
      'The one receiving says nothing except to redirect.',
      'Two questions afterwards, out loud, then mark it done.',
    ],
    example: {
      label: 'Why the gate is real',
      lines: [
        'Rushing the stages removes the entire mechanism.',
        'So there is no way to skip ahead, and that is deliberate.',
        'Your progress is saved, so this can run over weeks.',
      ],
    },
    notes: [
      'Everything else here is trying to escalate something. This one takes the goal away on purpose, and that contrast is why it belongs.',
      'Treating an early stage as a route to something else is the specific thing this rules out.',
      'Only your progress is saved. Nothing you say is.',
    ],
  },

  story: {
    summary: 'A direction, an opening line you did not fully choose, and then you talk.',
    steps: [
      'The app gives a direction and names who is telling this one.',
      'You each privately pick one opening line out of a hand.',
      'The teller sees both, not knowing which is whose, and picks one.',
      'They tell that story. The other one listens and asks a single question at the end.',
    ],
    example: {
      label: 'Why the line is forced',
      lines: [
        'Left to yourself you spend the first minute deciding which story this is.',
        'Handed a first sentence, you are already telling one.',
        'And because they put a line in too, what you tell was partly their choice.',
      ],
    },
    notes: [
      'No time limit and no interruptions. The single question at the end is a rule rather than a suggestion.',
      'Pick the line you would most want to hear them tell, not the one easiest for you.',
      'Nothing from this is written down anywhere.',
    ],
  },

  bodymap: {
    summary: 'You each mark where you want to be touched. Then both maps are shown together.',
    steps: [
      'Pick a level, then tap everywhere on the figure it applies to.',
      'Hand the phone over. The other one does the same without seeing yours.',
      'Both maps come back side by side, plus a combined one.',
      'Where the maps disagree is the part worth talking about.',
    ],
    example: {
      label: 'Why a picture',
      lines: [
        'A list of body parts is forgettable.',
        'A map is glanceable and you will actually look at it again.',
        'It is the only thing here whose output is spatial.',
      ],
    },
    notes: [
      'This one saves BOTH maps, which nothing else in the app does. Seeing them beside each other is the whole game, so you are both making yours knowing it gets shown.',
      'Anywhere either of you marks as not here is excluded from the games that use the map.',
      'You can delete both maps from the end screen, and that removes them from the phone.',
    ],
  },

  ordered: {
    summary: 'A fixed sequence, in sets, that you can put down and pick up again.',
    steps: [
      'A question comes up. Both of you answer it out loud, one after the other.',
      'Tap through when you have both answered.',
      'There is a break between sets, and you can stop there.',
      'Your place is remembered, so picking it up another day starts where you left it.',
    ],
    example: {
      label: 'Why the order is locked',
      lines: [
        'The late questions work because the early ones came first.',
        'Each set asks for more than the one before it.',
        'Shuffling would turn a ramp into a pile, so nothing here shuffles.',
      ],
    },
    notes: [
      'Answer at length. One-word answers are the only way to waste this.',
      'Stopping partway is normal and the app is built for it. Several sittings is a normal way to do this.',
      'Only your place is saved. Nothing either of you says is written down.',
    ],
  },
};
