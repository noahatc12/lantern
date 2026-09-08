#!/usr/bin/env node
/**
 * Soak: play one deck for a long time and check the properties that only
 * diverge over many turns.
 *
 * The ladder bug survived every short test because it only shows up after
 * several draws. Single-step assertions structurally cannot see that class, so
 * this plays a full deck through and watches:
 *
 *   - no card repeats before the pool is genuinely exhausted
 *   - the ladder climbs all the way to the ceiling
 *   - seen-history survives a reload mid-session
 *
 *   node scripts/soak.mjs
 */

import { readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env.SOAK_BASE ?? 'http://localhost:4176/lantern/';
const PASS = process.env.SOAK_PASS ?? readFileSync('.passphrase.local', 'utf8').trim();
const DECK = JSON.parse(readFileSync('decks/truth-or-dare.json', 'utf8'));
/**
 * A split deck can only go as far as its SMALLER half before that half has to
 * recycle. Truth or Dare is 70 truths and 50 dares, so alternating 120 draws
 * must reuse a dare after 100, and asserting 120 unique was my error rather
 * than the app's. The honest bound is twice the smaller half.
 */
const KINDS = [...new Set(DECK.cards.map((c) => c.kind).filter(Boolean))];
const PER_KIND = KINDS.map((k) => DECK.cards.filter((c) => c.kind === k).length);
const TOTAL = KINDS.length > 1 ? Math.min(...PER_KIND) * KINDS.length : DECK.cards.length;

const failures = [];
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(`${name} ${detail}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate__input', { timeout: 20000 });
  await page.fill('.gate__input', PASS);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.gate__input').length === 2, {
    timeout: 40000,
  });
  const inputs = page.locator('.gate__input');
  await inputs.nth(0).fill('Noah');
  await inputs.nth(1).fill('Lily');
  await page.click('.btn--primary');
  await page.waitForSelector('.decks', { timeout: 15000 });
  await page.locator('.tier').nth(4).click();

  const openDeck = async () => {
    await page.locator('.deckcard__title', { hasText: 'Truth or Dare' }).click();
    await page.waitForSelector('.rules', { timeout: 10000 });
    await page.locator('.rules__actions .btn--primary').click();
    await page.waitForSelector('.play__turn', { timeout: 10000 });
  };

  await openDeck();

  const seen = [];
  const tiers = new Set();
  let firstRepeatAt = null;
  let reloadedAt = null;

  console.log(`soak: drawing ${TOTAL} times from a ${TOTAL}-card deck\n`);

  for (let i = 0; i < TOTAL; i++) {
    // Alternate truth and dare so both halves of the split deck are exercised.
    const choices = page.locator('.play__choices .btn');
    await choices.nth(i % (await choices.count())).click();
    await page.waitForSelector('.card', { timeout: 10000 });

    const text = (await page.locator('.card').first().innerText()).trim();
    tiers.add((await page.locator('.play__tier').innerText()).trim());

    if (seen.includes(text) && firstRepeatAt === null) firstRepeatAt = i + 1;
    seen.push(text);

    await page.locator('.play__actions .btn--primary').click();
    await page.waitForSelector('.play__turn', { timeout: 10000 });

    // Reload once, partway through, and carry on in the same deck.
    if (i === Math.floor(TOTAL / 3)) {
      reloadedAt = i + 1;
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.decks', { timeout: 20000 });
      await openDeck();
    }
  }

  const unique = new Set(seen).size;
  console.log('');
  check(
    `no repeat across ${TOTAL} draws`,
    firstRepeatAt === null,
    firstRepeatAt ? `first repeat at draw ${firstRepeatAt}, ${unique}/${TOTAL} unique` : '',
  );
  check('the ladder reached the ceiling', tiers.has('tier 5'), [...tiers].join(', '));
  check('the ladder actually moved', tiers.size > 1, [...tiers].join(', '));
  check(`survived a reload at draw ${reloadedAt}`, true);
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();

  if (failures.length) {
    console.error('\nSOAK FAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nsoak clean.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
