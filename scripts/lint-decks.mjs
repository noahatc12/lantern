#!/usr/bin/env node
/**
 * Content lint. Fails the build rather than warning, because a rule that only
 * warns is a suggestion.
 *
 * Two severities, loaded from a local rules file:
 *
 *   List A - hard failures. No override of any kind, by design.
 *   List B - fails only in a default file. Passes inside one declaring
 *            "optIn": true, or on an entry carrying "lintOk": "<reason>",
 *            which keeps every exception visible in the diff.
 *
 * Both lists are deliberately over-broad. A false positive costs one rewrite; a
 * false negative ships something that was never supposed to ship.
 *
 * This can only run where the plaintext source is, which is locally, since
 * decks/*.json is gitignored and only ciphertext is committed. So it is a
 * pre-push gate first and a CI gate second. In CI it is near-vacuous by design,
 * and its job there is to catch plaintext committed by mistake.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DECK_DIR = path.resolve('decks');

/**
 * The actual pattern vocabulary lives in lint-rules.local.json, which is
 * gitignored. This repo is public and the wordlists themselves are content, so
 * they do not ship here. The rules file is:
 *
 *   { "listA": ["regex source", ...], "listB": ["regex source", ...] }
 *
 * Structural checks below (tier range, duplicates, house style) are content-free
 * and always run.
 */
const RULES_FILE = path.resolve('lint-rules.local.json');

function loadRules() {
  if (!existsSync(RULES_FILE)) {
    console.warn(
      'WARNING: lint-rules.local.json not found. Structural checks only.\n' +
        '         Content rules are NOT being enforced in this run.',
    );
    return { listA: [], listB: [] };
  }
  const raw = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  const compile = (arr) => (Array.isArray(arr) ? arr : []).map((src) => new RegExp(src, 'i'));
  const rules = { listA: compile(raw.listA), listB: compile(raw.listB) };

  // Self-test. A rules file can parse cleanly and still be completely inert:
  // a single backslash where two are needed turns \b into a backspace control
  // character, every rule silently stops matching, and the lint reports PASSED
  // while enforcing nothing. That already happened once. So the rules must
  // prove they can catch known-bad strings before any real content is checked.
  const canaries = [
    ['listA', raw.selfTestA, rules.listA],
    ['listB', raw.selfTestB, rules.listB],
  ];
  const dead = [];
  for (const [name, samples, regexes] of canaries) {
    if (!Array.isArray(samples) || samples.length === 0) {
      dead.push(`${name}: no self-test samples defined`);
      continue;
    }
    for (const sample of samples) {
      if (!regexes.some((re) => re.test(sample))) {
        dead.push(`${name}: nothing matched canary "${sample}"`);
      }
    }
  }
  if (dead.length > 0) {
    console.error('CONTENT LINT SELF-TEST FAILED. The rules are not enforcing anything.');
    for (const d of dead) console.error(`  - ${d}`);
    console.error('Check that backslashes are doubled in the rules file.');
    process.exit(1);
  }

  return rules;
}

const { listA: LIST_A, listB: LIST_B } = loadRules();

const STRUCTURAL = [
  {
    id: 'em-dash',
    test: (text) => text.includes('—'),
    msg: 'contains an em dash (house style: never)',
  },
];

const problems = [];
let cardsChecked = 0;
let stringsChecked = 0;
let decksChecked = 0;

/** Keys whose values are slugs or machine identifiers, not prose. */
const NOT_PROSE = new Set(['id', 'engine', 'key', 'duration', 'v']);

/** Every string in the object tree, with the path it was found at. */
function walkStrings(node, visit, path = '') {
  if (typeof node === 'string') {
    visit(node, path || '(root)');
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (NOT_PROSE.has(k)) continue;
      walkStrings(v, visit, path ? `${path}.${k}` : k);
    }
  }
}

/** Content rules only. Structural card rules stay in checkCard. */
function checkText(deckName, optIn, text, where) {
  if (!text.trim()) return;
  stringsChecked += 1;

  for (const re of LIST_A) {
    if (re.test(text)) {
      problems.push({
        level: 'BANNED',
        where: `${deckName} ${where}`,
        msg: `List A match ${re} :: "${text.slice(0, 90)}"`,
      });
    }
  }

  for (const re of LIST_B) {
    if (re.test(text) && !optIn) {
      problems.push({
        level: 'GATED',
        where: `${deckName} ${where}`,
        msg: `List B match ${re} in a base deck :: "${text.slice(0, 90)}"`,
      });
    }
  }

  if (text.includes('—')) {
    problems.push({
      level: 'ERROR',
      where: `${deckName} ${where}`,
      msg: 'contains an em dash (house style: never)',
    });
  }
}

function checkCard(deckName, optIn, card, index) {
  const where = `${deckName} #${index} (${card.id ?? 'no id'})`;
  const text = String(card.text ?? '');

  if (!text.trim()) {
    problems.push({ level: 'ERROR', where, msg: 'empty card text' });
    return;
  }

  const tier = card.tier;
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    problems.push({ level: 'ERROR', where, msg: `tier must be an integer 1-5, got ${tier}` });
  }

  // Content rules are applied by the tree walk, which sees every string in the
  // deck rather than only the ones reachable from here.
  cardsChecked += 1;
}

async function main() {
  if (!existsSync(DECK_DIR)) {
    console.log('deck lint: no decks/ directory yet, nothing to check.');
    return;
  }

  const files = (await readdir(DECK_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('deck lint: no plaintext decks present (expected in CI), nothing to check.');
    return;
  }

  for (const file of files) {
    const raw = await readFile(path.join(DECK_DIR, file), 'utf8');
    let deck;
    try {
      deck = JSON.parse(raw);
    } catch (err) {
      problems.push({ level: 'ERROR', where: file, msg: `invalid JSON: ${err.message}` });
      continue;
    }

    decksChecked += 1;
    const optIn = deck.optIn === true;

    // Engine contract. A deck that does not satisfy its engine renders wrong
    // rather than failing, which is the quietest way to ship something broken.
    const CONTRACTS = {
      ladder: (d) => d.cards.every((c) => typeof c.rung === 'number') || 'every card needs a rung',
      timer: (d) => d.cards.every((c) => typeof c.at === 'number') || 'every card needs an at',
      builder: (d) => (Array.isArray(d.slotDefs) && d.slotDefs.length > 0) || 'needs slotDefs',
      predict: (d) => typeof d.slotCount === 'number' || 'needs slotCount',
    };
    const contract = CONTRACTS[deck.engine];
    if (contract) {
      const verdict = contract(deck);
      if (verdict !== true) {
        problems.push({ level: 'ERROR', where: file, msg: `engine "${deck.engine}": ${verdict}` });
      }
    }
    const cards = Array.isArray(deck.cards) ? deck.cards : [];

    // Walk the ENTIRE deck and lint every string in it, wherever it lives.
    //
    // This used to check `cards[]` only, so builder slot pools shipped
    // unchecked while the lint still reported PASS. Patching in slotDefs fixed
    // that instance and left the class: any field added later would be exempt
    // again by default. Closed-by-default instead. A new shape cannot escape a
    // tree walk, only an allowlist of known locations.
    walkStrings(deck, (value, path) => {
      checkText(file, optIn, value, path);
    });

    const seen = new Map();
    cards.forEach((card, i) => {
      checkCard(file, optIn, card, i);
      const key = String(card.text ?? '').trim().toLowerCase();
      if (key && seen.has(key)) {
        problems.push({
          level: 'ERROR',
          where: `${file} #${i}`,
          msg: `duplicate of card #${seen.get(key)}`,
        });
      } else if (key) {
        seen.set(key, i);
      }
    });
  }

  const banned = problems.filter((p) => p.level === 'BANNED');
  const gated = problems.filter((p) => p.level === 'GATED');
  const errors = problems.filter((p) => p.level === 'ERROR');

  for (const p of problems) {
    console.error(`  [${p.level}] ${p.where}: ${p.msg}`);
  }

  console.log(
    `\ndeck lint: ${decksChecked} deck(s), ${cardsChecked} card(s), ${stringsChecked} string(s) checked. ` +
      `${banned.length} banned, ${gated.length} gated, ${errors.length} structural.`,
  );

  if (problems.length > 0) {
    console.error('\ncontent lint FAILED.');
    process.exit(1);
  }

  console.log('deck lint passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
