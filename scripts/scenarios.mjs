#!/usr/bin/env node
/**
 * Dirty-state scenarios.
 *
 * Every other harness starts from an empty browser. A real person never does:
 * they arrive with a half-played deck, a saved match result, a vault with
 * things in it, and occasionally storage written by an older build of the app.
 * The scroll bug hid from the scripted audit for exactly this reason, so this
 * exists to make "arrives dirty" a first-class case rather than an accident.
 *
 *   node scripts/scenarios.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE = process.env.SCEN_BASE ?? 'http://localhost:4176/lantern/';
const PASS = process.env.SCEN_PASS ?? readFileSync('.passphrase.local', 'utf8').trim();

const decks = readdirSync('decks')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join('decks', f), 'utf8')));

const byId = (id) => decks.find((d) => d.id === id);
const results = [];

function check(scenario, name, ok, detail = '') {
  results.push({ scenario, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` (${detail})` : ''}`);
}

/** Boot with a given localStorage state already present. */
async function withState(browser, state, fn, { expectUnlocked = true } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const errors = [];
  await ctx.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) {
      window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, state);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  if (expectUnlocked) {
    // A cached key should skip straight past the passphrase.
    await page.waitForSelector('.decks, .gate__input', { timeout: 20000 });
  }

  await fn(page, errors);
  await ctx.close();
}

/** Unlock normally and capture the derived key so scenarios can reuse it. */
async function captureKey(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate__input', { timeout: 20000 });
  await page.fill('.gate__input', PASS);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.gate__input').length === 2, { timeout: 40000 });
  const key = await page.evaluate(() => localStorage.getItem('lantern.contentKey'));
  await ctx.close();
  return key;
}

async function main() {
  const browser = await chromium.launch();
  const key = await captureKey(browser);
  if (!key) throw new Error('could not capture a content key');

  const unlocked = {
    'lantern.contentKey': key,
    'lantern.names': JSON.stringify(['Noah', 'Lily']),
    'lantern.maxTier': '5',
  };

  // ---- 1. A deck already played to exhaustion -----------------------------
  console.log('\nscenario: a deck already played to exhaustion');
  const tod = byId('truth-or-dare');
  await withState(
    browser,
    { ...unlocked, [`lantern.seen.${tod.id}`]: JSON.stringify(tod.cards.map((c) => c.id)) },
    async (page, errors) => {
      await page.waitForSelector('.decks', { timeout: 15000 });
      await page.locator('.deckcard__title', { hasText: 'Truth or Dare' }).click();
      await page.waitForSelector('.rules', { timeout: 10000 });
      const body = await page.locator('.rules').innerText();
      check('exhausted', 'offers to start the deck over', /start the deck over/i.test(body));
      check('exhausted', 'reports progress honestly', /seen/i.test(body), body.slice(0, 80));
      await page.locator('.rules__actions .btn--primary').click();
      await page.waitForSelector('.play__turn', { timeout: 10000 });
      await page.locator('.play__choices .btn').first().click();
      await page.waitForTimeout(300);
      const drew = (await page.locator('.card').count()) > 0;
      check('exhausted', 'still draws rather than dead-ending', drew);
      check('exhausted', 'no errors', errors.length === 0, errors.join('|'));
    },
  );

  // ---- 2. A saved match result --------------------------------------------
  console.log('\nscenario: a previous match result exists');
  const bucket = byId('bucket-list');
  await withState(
    browser,
    {
      ...unlocked,
      [`lantern.match.${bucket.id}`]: JSON.stringify({
        at: Date.now(),
        both: bucket.cards.slice(0, 3).map((c) => c.id),
        partial: bucket.cards.slice(3, 5).map((c) => c.id),
      }),
    },
    async (page, errors) => {
      await page.waitForSelector('.decks', { timeout: 15000 });
      await page.locator('.deckcard__title', { hasText: 'Bucket List Match' }).click();
      await page.waitForSelector('.rules', { timeout: 10000 });
      const hasReview = (await page.locator('.rules__actions .btn--ghost').count()) > 0;
      check('match-result', 'previous result is offered', hasReview);
      if (hasReview) {
        await page.locator('.rules__actions .btn--ghost').click();
        await page.waitForSelector('.result', { timeout: 10000 });
        const txt = await page.locator('.result').innerText();
        check('match-result', 'restores the saved overlap', /both yes \(3\)/i.test(txt), txt.slice(0, 60));
      }
      check('match-result', 'no errors', errors.length === 0, errors.join('|'));
    },
  );

  // ---- 3. Vault with existing items ---------------------------------------
  console.log('\nscenario: vault already has items');
  await withState(
    browser,
    {
      ...unlocked,
      'lantern.vault.items': JSON.stringify([
        { id: 'a', from: 0, text: 'an hour, their choice', createdAt: Date.now() },
        { id: 'b', from: 1, text: 'redeemed already', createdAt: 1, redeemedAt: 2 },
        { id: 'c', from: 0, text: 'sealed one', createdAt: 1, unlockAt: Date.now() + 86400000 },
      ]),
    },
    async (page, errors) => {
      await page.waitForSelector('.decks', { timeout: 15000 });
      await page.locator('.deckcard__title', { hasText: 'The Vault' }).click();
      await page.waitForSelector('.rules', { timeout: 10000 });
      await page.locator('.rules__actions .btn--primary').click();
      await page.waitForSelector('.vault', { timeout: 10000 });
      const txt = await page.locator('.vault').innerText();
      check('vault', 'open items shown', /an hour, their choice/.test(txt));
      check('vault', 'redeemed kept separate', /redeemed \(1\)/i.test(txt), txt.slice(0, 80));
      check('vault', 'sealed item stays sealed', /sealed\./i.test(txt) && !/sealed one/.test(txt));
      check('vault', 'no errors', errors.length === 0, errors.join('|'));
    },
  );

  // ---- 4. Storage corrupted by an older build ------------------------------
  console.log('\nscenario: every stored value is the wrong shape');
  await withState(
    browser,
    {
      'lantern.contentKey': JSON.stringify(12345),
      'lantern.names': JSON.stringify('not an array'),
      'lantern.maxTier': JSON.stringify('four'),
      'lantern.seen.truth-or-dare': JSON.stringify({ nope: true }),
      'lantern.vault.items': JSON.stringify([{ missing: 'fields' }]),
      'lantern.match.bucket-list': JSON.stringify('garbage'),
    },
    async (page, errors) => {
      // A bad cached key must fall back to asking, not crash.
      await page.waitForSelector('.gate__input', { timeout: 20000 });
      check('corrupt', 'falls back to the passphrase prompt', true);
      await page.fill('.gate__input', PASS);
      await page.click('button[type="submit"]');
      await page.waitForSelector('.gate__title, .decks', { timeout: 40000 });

      const needsNames = (await page.locator('.gate__title').count()) > 0;
      check('corrupt', 'bad names are discarded and re-asked', needsNames);
      if (needsNames) {
        const inputs = page.locator('.gate__input');
        await inputs.nth(0).fill('Noah');
        await inputs.nth(1).fill('Lily');
        await page.click('.btn--primary');
      }
      await page.waitForSelector('.decks', { timeout: 15000 });
      const tier = await page.locator('.tier.is-on .tier__n').innerText();
      check('corrupt', 'bad tier falls back to a valid one', /^[1-5]$/.test(tier.trim()), tier);

      await page.locator('.deckcard__title', { hasText: 'The Vault' }).click();
      await page.waitForSelector('.rules', { timeout: 10000 });
      await page.locator('.rules__actions .btn--primary').click();
      await page.waitForSelector('.vault', { timeout: 10000 });
      check('corrupt', 'malformed vault items do not crash the vault', true);
      check('corrupt', 'no errors anywhere', errors.length === 0, errors.join('|'));
    },
    { expectUnlocked: false },
  );

  // ---- 5. Reload in the middle of a game -----------------------------------
  console.log('\nscenario: reload mid-game');
  await withState(browser, unlocked, async (page, errors) => {
    await page.waitForSelector('.decks', { timeout: 15000 });
    await page.locator('.deckcard__title', { hasText: 'Truth or Dare' }).click();
    await page.waitForSelector('.rules', { timeout: 10000 });
    await page.locator('.rules__actions .btn--primary').click();
    await page.waitForSelector('.play__turn', { timeout: 10000 });
    await page.locator('.play__choices .btn').first().click();
    await page.waitForSelector('.card', { timeout: 10000 });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.decks, .gate__input', { timeout: 20000 });
    const landedHome = (await page.locator('.decks').count()) > 0;
    check('reload', 'recovers to the game list, still unlocked', landedHome);
    check('reload', 'scroll is at the top after reload', (await page.evaluate(() => window.scrollY)) === 0);
    check('reload', 'no errors', errors.length === 0, errors.join('|'));
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scenario checks passed.`);
  if (failed.length) {
    console.error('\nFAILURES:');
    for (const f of failed) console.error(`  [${f.scenario}] ${f.name} ${f.detail}`);
    process.exit(1);
  }
  console.log('dirty-state scenarios clean.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
