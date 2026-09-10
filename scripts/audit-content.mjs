#!/usr/bin/env node
/**
 * Content audit: does each card make sense WHERE IT IS?
 *
 * The existing deck lint checks whether a card is allowed to exist. This checks
 * whether it belongs on the screen it will appear on, which is a different
 * question and the one that actually bites during a session. A perfectly
 * acceptable sentence in the wrong engine reads as a mistake:
 *
 *   a question in a deck whose UI says "do it"
 *   a command in a deck that shows a Yes / No / Maybe sorter
 *   a scale card that cannot be rated out of ten
 *   a compare prompt that is not a question, so both people write nothing
 *
 * None of that fails the build today, and none of it is visible from reading
 * one card at a time, which is how content gets written. It only shows up when
 * you read a whole deck through the shape of its engine, which is what this
 * does.
 *
 * Two of these FAIL the build and the rest only report, and the split is
 * deliberate. A line appearing in two decks is an objective fact, and so is a
 * question in a deck whose only controls are Yes, No and Maybe; those cannot be
 * matters of taste and a gate that merely mentions them is a gate nobody reads.
 * Length and punctuation are judgement calls, and a judgement call that fails a
 * build gets silenced within a week, so those stay as notes.
 *
 * This distinction was not free. Both hard checks were written as notes first,
 * and the mutation suite caught them surviving a deliberately broken card,
 * which is the whole reason that suite exists.
 *
 *   npm run audit:content
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DECK_DIR = path.resolve('decks');

const notes = [];
const errors = [];

function note(deck, id, msg, text) {
  notes.push({ deck, id, msg, text });
}

function error(deck, id, msg, text) {
  errors.push({ deck, id, msg, text });
}

const isQuestion = (t) => t.trim().endsWith('?');
const words = (t) => t.trim().split(/\s+/).length;

/**
 * What each engine puts on screen, and therefore what its content has to be.
 * Written as prose rather than a table because the reason matters more than
 * the rule: the rule is guessable from the screen, the reason is not.
 */
const SHAPE = {
  // "Answer it out loud, or do it." Either works.
  draw: null,

  // Sorted one at a time into No / Maybe / Yes. A question cannot be sorted:
  // you cannot say "yes" to "what is your favourite colour?".
  match: {
    test: (t) => !isQuestion(t),
    why: 'a sorting card is a thing to say yes or no to, not a question',
  },

  // Rated nought to ten. Same problem as above, plus it has to be a single
  // thing rather than a list, or the two ratings are not about the same thing.
  scale: {
    test: (t) => !isQuestion(t),
    why: 'a rating card is a thing to rate, not a question',
  },

  // Both people write an answer, privately, then both are shown. With no
  // question there is nothing to answer.
  compare: {
    test: (t) => isQuestion(t),
    why: 'a compare card is answered in writing by both people, so it has to ask something',
  },

  // One person answers as the other. Same reason.
  quiz: {
    test: (t) => isQuestion(t),
    why: 'a quiz card is answered as the other person, so it has to ask something',
  },

  // Read aloud as an instruction by whoever is leading.
  leader: {
    test: (t) => !isQuestion(t),
    why: 'a leader card is read out as an order, so a question does not work',
  },

  // A constraint on what the active person may do.
  endurance: {
    test: (t) => !isQuestion(t),
    why: 'an endurance card is a restriction, not a question',
  },

  // The subject of a round of authored statements.
  // Almost always a noun phrase ("Something you want and have not asked for"),
  // which is exactly right and which an earlier version of this check flagged
  // twenty eight times in one deck. The only wrong shape is an order, because
  // nobody here is being told to do anything.
  predict: {
    test: (t) => !/^(do|go|take|put|kiss|touch|get) /i.test(t),
    why: 'a predict prompt names what to write about, it does not give an order',
  },

  // Asked out loud, in order, by both people.
  ordered: {
    // The ask does not have to come first in the sentence: "If we were about
    // to become close friends, tell me what would matter most" is a good one
    // and was flagged for word order alone.
    test: (t) => isQuestion(t) || /\b(tell|say|make|share|take|finish|name)\b/i.test(t),
    why: 'an ordered card is asked out loud, so it has to be a question or a direct ask',
  },

  // The direction for a story someone is about to tell.
  story: {
    test: (t) => /^(tell|share|talk)\b/i.test(t),
    why: 'a story prompt sets a direction, so it should start by asking for one',
  },
};

/** Caps past which a card stops fitting the screen it is shown on. */
const LENGTH = {
  match: 22,
  scale: 26,
  leader: 22,
  endurance: 24,
  draw: 44,
  compare: 40,
  quiz: 34,
  ordered: 60,
  story: 26,
  ladder: 34,
  relay: 24,
  timer: 30,
  authored: 30,
  builder: 14,
  bodymap: 20,
  staged: 60,
  vault: 30,
};

async function main() {
  const files = (await readdir(DECK_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('content audit: no plaintext decks present, nothing to audit.');
    return;
  }

  const decks = [];
  for (const file of files) {
    decks.push(JSON.parse(await readFile(path.join(DECK_DIR, file), 'utf8')));
  }

  // ---- across decks -------------------------------------------------------
  // The same line in two decks is not automatically wrong, but it is always
  // worth a look: it usually means one of them was authored from the other and
  // the tier or the framing did not come along.
  const seen = new Map();
  for (const d of decks) {
    for (const c of d.cards ?? []) {
      const key = String(c.text ?? '').trim().toLowerCase().replace(/[^a-z ]/g, '');
      if (!key) continue;
      if (seen.has(key)) {
        const first = seen.get(key);
        if (first.deck !== d.id) {
          error(d.id, c.id, `same line as ${first.deck} ${first.id}`, c.text);
        }
      } else {
        seen.set(key, { deck: d.id, id: c.id });
      }
    }
  }

  // Near copies inside one deck. Exact matching misses these and they are the
  // ones that actually happen: a card gets rewritten and lands next to the one
  // it was rewritten from. Caught exactly that way once, on an edit made while
  // clearing the exact-duplicate list above.
  //
  // Compared on content words rather than on the opening, because half the
  // decks here are built on a fixed stem. "Would you rather" opens thirty three
  // cards in one deck and an opening-words check called every one of them a
  // duplicate of the first.
  const STOP = new Set(
    ('a an and are as at be been being do does for from get getting had has have i if in into is '
      + 'it its me my no not of on one or our out rather so something that the their them then there '
      + 'they this to us was we were what when where which while who with without would you your')
      .split(' '),
  );
  const contentWords = (t) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z ]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    );

  for (const d of decks) {
    const rows = (d.cards ?? []).map((c) => ({ id: c.id, text: String(c.text ?? ''), w: contentWords(String(c.text ?? '')) }));
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a.w.size < 3 || b.w.size < 3) continue;
        let shared = 0;
        for (const w of a.w) if (b.w.has(w)) shared += 1;
        const union = a.w.size + b.w.size - shared;
        if (union > 0 && shared / union >= 0.6) {
          // Usually deliberate: several decks pair a thing with its opposite on
          // purpose (giving and getting, talking and not talking, hands and
          // mouth) and those land here every run. The note names the shape so
          // the list stays readable rather than becoming eleven lines nobody
          // reads. What it is really looking for is the accident: a card
          // rewritten into a near copy of the one beside it.
          note(
            d.id,
            b.id,
            `nearly the same as ${a.id}: deliberate opposite, or an accident?`,
            `${b.text}  /  ${a.text}`,
          );
        }
      }
    }
  }

  // ---- per deck -----------------------------------------------------------
  let checked = 0;
  for (const d of decks) {
    const shape = SHAPE[d.engine];
    const cap = LENGTH[d.engine] ?? 40;
    const tiers = new Set();

    for (const c of d.cards ?? []) {
      const text = String(c.text ?? '').trim();
      if (!text) continue;
      checked += 1;
      tiers.add(c.tier);

      if (shape && !shape.test(text)) {
        error(d.id, c.id, shape.why, text);
      }
      if (words(text) > cap) {
        note(d.id, c.id, `${words(text)} words, long for a ${d.engine} card`, text);
      }
      if (/^[a-z]/.test(text)) {
        error(d.id, c.id, 'starts lower case', text);
      }
      if (/\s{2,}/.test(text)) {
        error(d.id, c.id, 'double space', text);
      }
      if (/[.,!?;:]$/.test(text) === false && words(text) > 6 && d.engine !== 'match' && d.engine !== 'scale') {
        note(d.id, c.id, 'no end punctuation on a full sentence', text);
      }
      // Second person, present tense. A card about "the player" or "they"
      // without an antecedent is a rules note that ended up in the deck.
      if (/\b(the player|the user|participants?)\b/i.test(text)) {
        error(d.id, c.id, 'talks about a player rather than to a person', text);
      }
    }

    // A deck whose cards all sit at one tier inside a wider declared range
    // will never ramp, which is the whole point of the range.
    const [lo, hi] = d.tierRange ?? [1, 5];
    if (hi > lo && tiers.size === 1) {
      note(d.id, '-', `declares tiers ${lo} to ${hi} but every card is tier ${[...tiers][0]}`, '');
    }
    for (const t of tiers) {
      if (t < lo || t > hi) {
        error(d.id, '-', `has a tier ${t} card but declares ${lo} to ${hi}`, '');
      }
    }
  }

  // ---- report -------------------------------------------------------------
  const show = (list, label) => {
    if (list.length === 0) return;
    console.log(`\n${label} (${list.length}):`);
    for (const p of list) {
      console.log(`  ${p.deck} ${p.id}: ${p.msg}`);
      if (p.text) console.log(`    "${p.text.slice(0, 96)}"`);
    }
  };

  show(errors, 'BROKEN');
  show(notes, 'WORTH A LOOK');

  console.log(
    `\ncontent audit: ${decks.length} decks, ${checked} cards. ` +
      `${errors.length} broken, ${notes.length} worth a look.`,
  );

  if (errors.length > 0) {
    console.error('\ncontent audit FAILED.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
