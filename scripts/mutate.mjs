#!/usr/bin/env node
/**
 * Mutation testing: prove every gate can actually fail.
 *
 * Twice in this project a gate reported success while enforcing nothing. The
 * content lint parsed a rules file whose regexes were all inert and printed
 * PASSED. The unit suite passed on a draw engine whose ladder could never
 * leave tier 1. In both cases the green tick was the problem, because it
 * stopped anyone looking.
 *
 * So each entry below breaks something on purpose and asserts the relevant
 * gate goes red. A mutation that survives means the gate is decoration, and
 * that is reported as a failure of the SUITE rather than of the code.
 *
 * Every mutation here is gated on the UNIT suite, deliberately. A browser-gated
 * mutation would take two minutes each and this would stop being something you
 * run before every push. Anything that can only be caught in a browser belongs
 * in the audit, which is run by the same gate a few steps later.
 *
 * Restores every file afterwards, including on crash.
 *
 *   npm run mutate
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const MUTATIONS = [
  {
    name: 'draw ignores the tier ceiling',
    file: 'src/lib/deck.ts',
    find: 'if (card.tier > state.effectiveTier) return false;',
    replace: '// mutated',
    gate: 'npm run --silent test',
  },
  {
    name: 'draw stops honouring the no-repeat history',
    file: 'src/lib/deck.ts',
    find: 'let unseen = pool.filter((c) => !seen.has(c.id));',
    replace: 'let unseen = pool.slice();',
    gate: 'npm run --silent test',
  },
  {
    name: 'recycling wipes the whole deck history again',
    file: 'src/lib/deck.ts',
    // Single-line target on purpose: a multi-line `find` is line-ending
    // sensitive and went stale the moment the file was normalised.
    find: '? [...state.drawn.filter((id) => !poolIds.has(id)), picked.id]',
    replace: '? [picked.id]',
    gate: 'npm run --silent test',
  },
  {
    name: 'drawing advances the turn again, so skip steals one',
    file: 'src/lib/deck.ts',
    find: '    state: { ...state, drawn, drawCount: state.drawCount + 1 },',
    replace:
      "    state: { ...state, drawn, drawCount: state.drawCount + 1, turn: state.turn === 'a' ? 'b' : 'a' },",
    gate: 'npm run --silent test',
  },
  {
    name: 'the ladder ceiling collapses to 1 again',
    file: 'src/lib/deck.ts',
    find: '    effectiveTier: config.maxTier,',
    replace: '    effectiveTier: config.ladder ? 1 : config.maxTier,',
    gate: 'npm run --silent test',
  },
  {
    name: 'yellow stops lowering the ceiling',
    file: 'src/lib/deck.ts',
    find: 'const lowered = Math.max(1, state.effectiveTier - 1) as Tier;',
    replace: 'const lowered = state.effectiveTier;',
    gate: 'npm run --silent test',
  },
  {
    name: 'storage stops validating what it reads',
    file: 'src/lib/storage.ts',
    find: 'if (isValid && !isValid(parsed)) {',
    replace: 'if (false && isValid && !isValid(parsed)) {',
    gate: 'npm run --silent test',
  },
  {
    name: 'unseal stops rejecting a wrong passphrase',
    file: 'src/lib/crypto.ts',
    find: "  const salt = fromB64(payload.salt);",
    replace: '  const salt = new Uint8Array(16);',
    gate: 'npm run --silent test',
  },
  {
    name: 'the shared filter stops honouring the ceiling',
    file: 'src/lib/deck.ts',
    find: '    (it) => it.tier <= maxTier && (it.props ?? []).every((p) => hand.has(p)),',
    replace: '    (it) => (it.props ?? []).every((p) => hand.has(p)),',
    gate: 'npm run --silent test',
  },
  {
    name: 'the shared filter stops honouring the props',
    file: 'src/lib/deck.ts',
    find: '    (it) => it.tier <= maxTier && (it.props ?? []).every((p) => hand.has(p)),',
    replace: '    (it) => it.tier <= maxTier,',
    gate: 'npm run --silent test',
  },
  {
    name: 'erase-everything stops sparing what it was told to spare',
    file: 'src/lib/storage.ts',
    find: '  for (const k of keys()) if (!spare.has(k)) remove(k);',
    replace: '  for (const k of keys()) remove(k);',
    gate: 'npm run --silent test',
  },
  {
    name: 'the play history reports the first play instead of the last',
    file: 'src/lib/history.ts',
    find: '    row.last = Math.max(row.last, p.at);',
    replace: '    row.last = row.last || p.at;',
    gate: 'npm run --silent test',
  },
  {
    name: 'when-labels go back to elapsed hours instead of calendar days',
    file: 'src/lib/history.ts',
    find: '  const days = Math.floor((startOfDay(now) - startOfDay(at)) / 86400000);',
    replace: '  const days = Math.floor((now - at) / 86400000);',
    gate: 'npm run --silent test',
  },
  {
    name: 'the content lint rules go inert',
    file: 'lint-rules.local.json',
    find: '\\\\b',
    replace: '\\b',
    all: true,
    gate: 'npm run --silent lint:decks',
    skipIfMissing: true,
  },
];

const results = [];

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    return true; // gate passed
  } catch {
    return false; // gate failed, which is what a mutation should cause
  }
}

function main() {
  console.log(`mutation suite: ${MUTATIONS.length} mutations\n`);
  const restore = [];

  try {
    for (const m of MUTATIONS) {
      let original;
      try {
        original = readFileSync(m.file, 'utf8');
      } catch {
        if (m.skipIfMissing) {
          console.log(`  SKIP  ${m.name} (${m.file} not present)`);
          continue;
        }
        throw new Error(`missing ${m.file}`);
      }

      if (!original.includes(m.find)) {
        results.push({ name: m.name, ok: false, why: 'the code it targets has moved or changed' });
        console.log(`  STALE ${m.name}`);
        continue;
      }

      const mutated = m.all
        ? original.split(m.find).join(m.replace)
        : original.replace(m.find, m.replace);
      writeFileSync(m.file, mutated, 'utf8');
      restore.push([m.file, original]);

      const gatePassed = run(m.gate);
      writeFileSync(m.file, original, 'utf8');
      restore.pop();

      const caught = !gatePassed;
      results.push({ name: m.name, ok: caught, why: caught ? '' : 'SURVIVED: no gate noticed' });
      console.log(`  ${caught ? 'PASS ' : 'FAIL '} ${m.name}`);
    }
  } finally {
    // Never leave a mutated file behind, even on crash.
    for (const [file, original] of restore) writeFileSync(file, original, 'utf8');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} mutations caught.`);

  if (failed.length) {
    console.error('\nGATES THAT DID NOT BITE:');
    for (const f of failed) console.error(`  - ${f.name}: ${f.why}`);
    console.error('\nA mutation that survives means that gate is decoration.');
    process.exit(1);
  }
  console.log('every gate proved it can fail.');
}

main();
