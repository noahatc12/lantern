#!/usr/bin/env node
/**
 * Full interaction audit. Drives the real app through every screen and every
 * control, asserting behaviour rather than just taking pictures.
 *
 * The assertions that matter are the ones about state, not layout:
 *   - Skip must NOT pass the turn; Done must.
 *   - Swap must actually change who writes.
 *   - The ladder must not show a rung until BOTH players opt in.
 *   - A full match run must produce a result screen.
 *   - The ladder tier readout must climb rather than sit at the ceiling.
 *
 *   WALK_PASS='...' node scripts/walkthrough.mjs
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE = process.env.WALK_BASE ?? 'http://localhost:4175/lantern/';
const PASS = process.env.WALK_PASS;
const OUT = path.resolve('shots', 'walk');

if (!PASS) {
  console.error('WALK_PASS is required.');
  process.exit(1);
}

const failures = [];
const checks = [];
let n = 0;

function check(name, ok, detail = '') {
  checks.push({ name, ok });
  if (!ok) failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` (${detail})` : ''}`);
}

async function snap(page, name) {
  n += 1;
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow !== 0) failures.push(`${name}: horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) });
}

const txt = async (page, sel) => (await page.locator(sel).first().innerText()).trim();

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) failures.push(`console: ${m.text()}`);
  });

  // ---------- unlock ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate__input', { timeout: 20000 });
  await snap(page, 'unlock');

  await page.fill('.gate__input', 'definitely the wrong passphrase');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.gate__error', { timeout: 30000 });
  check('wrong passphrase is rejected with an error', true);
  await snap(page, 'unlock-wrong');

  await page.fill('.gate__input', PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.gate__title', { timeout: 40000 });

  // ---------- names ----------
  const inputs = page.locator('.gate__input');
  await inputs.nth(0).fill('Noah');
  await inputs.nth(1).fill('Lily');
  await snap(page, 'names');
  await page.click('.btn--primary');
  await page.waitForSelector('.decks', { timeout: 15000 });

  // ---------- home ----------
  await snap(page, 'home-default');
  const atTier = async () => (await page.locator('.tier.is-on .tier__n').innerText()).trim();
  check('a tier is selected by default', (await atTier()).length > 0);

  await page.locator('.tier').nth(0).click();
  const fewer = await page.locator('.deckcard').count();
  await page.locator('.tier').nth(4).click();
  const more = await page.locator('.deckcard').count();
  check('raising the ceiling reveals more decks', more > fewer, `${fewer} -> ${more}`);
  await snap(page, 'home-tier5');

  const open = async (title) => {
    await page.locator('.deckcard__title', { hasText: title }).click();
    await page.waitForSelector('.rules', { timeout: 10000 });
  };
  const home = async () => {
    const b = page.locator('.play__back');
    if (await b.count()) await b.first().click();
    await page.waitForSelector('.decks', { timeout: 10000 });
  };

  // ---------- rules screens exist for every deck ----------
  for (const title of [
    'Truth or Dare',
    'Bucket List Match',
    'Two Truths and a Turn-On',
    'The Long Kiss',
    'The Ask',
  ]) {
    await open(title);
    const steps = await page.locator('.rules__steps li').count();
    const notes = await page.locator('.rules__notes li').count();
    check(`${title}: has instructions`, steps >= 3 && notes >= 2, `${steps} steps, ${notes} notes`);
    await snap(page, `rules-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`);
    await home();
  }

  // ---------- Truth or Dare: skip vs done ----------
  await open('Truth or Dare');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.play__turn');
  const turn1 = await txt(page, '.play__turn');
  await snap(page, 'tod-turn');

  await page.locator('.play__choices .btn').first().click();
  await page.waitForSelector('.card');
  const card1 = await txt(page, '.card');
  const tierShown = await txt(page, '.play__tier');
  check('ladder opens low rather than at the ceiling', tierShown === 'tier 1', tierShown);
  await snap(page, 'tod-card');

  // Skip: new card, SAME person.
  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForTimeout(150);
  const card2 = await txt(page, '.card');
  check('skip draws a different card', card1 !== card2);
  await page.locator('.play__actions .btn--primary').click();
  await page.waitForSelector('.play__turn');
  const turn2 = await txt(page, '.play__turn');
  check('skip did not steal a turn (one Done = one pass)', turn1 !== turn2, `${turn1} -> ${turn2}`);

  // Play enough turns that the ladder must climb.
  let climbed = tierShown;
  for (let i = 0; i < 12; i++) {
    await page.locator('.play__choices .btn').first().click();
    await page.waitForSelector('.card');
    climbed = await txt(page, '.play__tier');
    await page.locator('.play__actions .btn--primary').click();
    await page.waitForSelector('.play__turn');
  }
  check('ladder climbs during a session', climbed !== 'tier 1', `ended at ${climbed}`);
  await snap(page, 'tod-climbed');

  // Stop controls appear once it is explicit.
  await page.locator('.play__choices .btn').first().click();
  await page.waitForSelector('.card');
  const hasStop = (await page.locator('.tl__btn--red').count()) > 0;
  check('stop controls present at tier 4 and above', hasStop);
  if (hasStop) {
    await snap(page, 'tod-stopcontrols');
    await page.locator('.tl__btn--red').click();
    await page.waitForSelector('.stopped__title');
    const stopped = await txt(page, '.stopped__title');
    check('red ends the session in one tap', stopped.toLowerCase().includes('stopped'));
    const body = await txt(page, '.stopped__body');
    check('stop screen does not attribute who stopped it', !/noah|lily/i.test(body));
    await snap(page, 'tod-stopped');
    await page.locator('.stopped .btn').click();
    await page.waitForSelector('.decks', { timeout: 10000 });
  } else {
    await home();
  }

  // ---------- Bucket List Match: full run ----------
  await open('Bucket List Match');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.sort');
  await snap(page, 'match-sorting');

  const sortAll = async () => {
    for (let i = 0; i < 40; i++) {
      if ((await page.locator('.sort').count()) === 0) break;
      const btns = ['.sort__yes', '.sort__maybe', '.sort__no'];
      await page.locator(btns[i % 3]).click();
      await page.waitForTimeout(30);
    }
  };
  await sortAll();
  await page.waitForSelector('.handoff', { timeout: 10000 });
  check('handoff screen appears between sorters', true);
  const handoffText = await txt(page, '.handoff');
  check('handoff names the other person', /lily/i.test(handoffText));
  await snap(page, 'match-handoff');

  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 5000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.sort');
  await sortAll();
  await page.waitForSelector('.result', { timeout: 10000 });
  const resultText = await txt(page, '.result');
  check(
    'a full match run produces a result',
    /both yes/i.test(resultText),
    resultText.slice(0, 60),
  );
  await snap(page, 'match-result');
  await home();

  // Result is retrievable afterwards.
  await open('Bucket List Match');
  const hasReview = (await page.locator('.rules__actions .btn--ghost').count()) > 0;
  check('previous match result is retrievable', hasReview);
  await home();

  // ---------- Two Truths: swap actually swaps ----------
  await open('Two Truths and a Turn-On');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.play__eyebrow');
  const writer1 = await txt(page, '.play__eyebrow');
  await snap(page, 'predict-prompt');

  await page.locator('.play__stage .btn--primary').click();
  await page.waitForSelector('.slot__input');
  const slots = page.locator('.slot__input');
  const nSlots = await slots.count();
  for (let i = 0; i < nSlots; i++) await slots.nth(i).fill(`statement ${i + 1}`);
  const disabledBeforeMark = await page
    .locator('.play__stage--form .btn--primary')
    .isDisabled();
  check('cannot submit before marking the real one', disabledBeforeMark);
  await page.locator('.slot__mark').nth(1).click();
  await snap(page, 'predict-write');
  await page.locator('.play__stage--form .btn--primary').click();

  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 5000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.guess');
  await snap(page, 'predict-guess');
  await page.locator('.guess').nth(1).click();
  await page.waitForSelector('.play__kind');
  const revealed = await txt(page, '.card');
  check('reveal shows the marked statement', revealed === 'statement 2', revealed);
  await snap(page, 'predict-reveal');

  await page.locator('.play__stage .btn--primary').click();
  await page.waitForSelector('.play__eyebrow');
  const writer2 = await txt(page, '.play__eyebrow');
  check('swap changes who writes', writer1 !== writer2, `${writer1} -> ${writer2}`);
  await home();

  // ---------- Long Kiss ----------
  await open('The Long Kiss');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.clock');
  const clock0 = await txt(page, '.clock');
  await snap(page, 'timer-idle');
  await page.locator('.play__stage .btn--primary').click();
  await page.waitForTimeout(1600);
  const clock1 = await txt(page, '.clock');
  check('clock counts down once started', clock0 !== clock1, `${clock0} -> ${clock1}`);
  check('a cue is shown while running', (await page.locator('.card').count()) > 0);
  await snap(page, 'timer-running');
  await home();

  // ---------- The Ask: both must opt in ----------
  await open('The Ask');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.optin');
  await snap(page, 'ladder-optin');

  await page.locator('.optin__btn').nth(0).click();
  const gated = (await page.locator('.play__actions').count()) === 0;
  check('one person opting in is not enough to reveal the rung', gated);

  await page.locator('.optin__btn').nth(1).click();
  await page.waitForSelector('.play__actions');
  check('both opting in reveals the rung', true);
  await snap(page, 'ladder-rung');

  await page.locator('.play__actions .btn--primary').click();
  await page.waitForSelector('.optin');
  const rungLabel = await txt(page, '.play__tier');
  check('advancing moves to the next rung', rungLabel.startsWith('rung 2'), rungLabel);

  await page.locator('.btn--ghost', { hasText: 'Enough' }).first().click();
  await page.waitForSelector('.stopped__title');
  const endText = await txt(page, '.stopped');
  check('Enough ends the game', /stopped at rung/i.test(endText));
  check('end screen never says who stopped it', !/noah|lily/i.test(endText));
  await snap(page, 'ladder-ended');

  await browser.close();

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n${passed}/${checks.length} interaction checks passed, ${n} screens captured.`);
  if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('audit clean.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
