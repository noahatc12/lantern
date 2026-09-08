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

import { mkdir, rm } from 'node:fs/promises';
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
  // Let entrance animations settle. Screenshotting mid-transition produced a
  // washed-out frame that I nearly mistook for a contrast problem.
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const el = document.documentElement;
    const first = document.querySelector(
      '.play__top, .home__top, .gate__title, .stopped__title, .handoff__eyebrow',
    );
    const r = first ? first.getBoundingClientRect() : null;
    return {
      overflow: el.scrollWidth - el.clientWidth,
      scrollY: window.scrollY || document.scrollingElement?.scrollTop || 0,
      topVisible: r ? r.top >= -1 && r.top < window.innerHeight : null,
      topOffset: r ? Math.round(r.top) : null,
    };
  });

  if (m.overflow !== 0) failures.push(`${name}: horizontal overflow ${m.overflow}px`);

  // A screen must start at its top. This is the assertion that would have
  // caught the scroll-position bug that shipped: React keeps window scroll
  // across a view swap, so opening a game from a scrolled list landed you
  // halfway down the new screen. It was visible in a screenshot and I read it
  // as a crop. Eyes miss this; an assertion cannot.
  if (m.scrollY !== 0) {
    failures.push(`${name}: screen opened already scrolled down (scrollY=${m.scrollY})`);
  }
  if (m.topVisible === false) {
    failures.push(`${name}: top of screen is off-viewport (top=${m.topOffset}px)`);
  }
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) });
}

const txt = async (page, sel) => (await page.locator(sel).first().innerText()).trim();

async function main() {
  // Wipe first. Stale screenshots from an earlier run survive renumbering and
  // get read as if they were current, which already caused one wrong reading.
  await rm(OUT, { recursive: true, force: true });
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
  await page.waitForFunction(() => document.querySelectorAll('.gate__input').length === 2, { timeout: 40000 });

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
    // Scroll first, the way a person browsing the list actually would.
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(120);
    await page.locator('.deckcard__title', { hasText: title }).click();
    await page.waitForSelector('.rules', { timeout: 10000 });
  };
  const home = async () => {
    const b = page.locator('.play__back');
    if (await b.count()) await b.first().click();
    await page.waitForSelector('.decks', { timeout: 10000 });
  };

  // ---------- scroll: forward to top, back restores ----------
  // Both directions asserted together, because fixing one broke the other and
  // a test for only the first would have called that a success.
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(150);
  const listBefore = await page.evaluate(() => window.scrollY);
  check('the list can be scrolled', listBefore > 100, String(listBefore));

  await page.locator('.deckcard__title', { hasText: 'Deep Talk' }).click();
  await page.waitForSelector('.rules', { timeout: 10000 });
  const inGame = await page.evaluate(() => window.scrollY);
  check('opening a game starts at the top', inGame === 0, `scrollY=${inGame}`);

  await page.locator('.play__back').first().click();
  await page.waitForSelector('.decks', { timeout: 10000 });
  await page.waitForTimeout(250);
  const listAfter = await page.evaluate(() => window.scrollY);
  check(
    'going back restores the list position',
    Math.abs(listAfter - listBefore) < 40,
    `${listBefore} -> ${listAfter}`,
  );
  await page.evaluate(() => window.scrollTo(0, 0));

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
    const summary = await txt(page, '.rules__summary');
    const hasExample = (await page.locator('.rules__example p').count()) > 0;
    check(
      `${title}: has instructions`,
      steps >= 3 && notes >= 2 && summary.length > 20 && hasExample,
      `${steps} steps, ${notes} notes, example=${hasExample}`,
    );
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
    // Cap generously and derive nothing from deck size: decks grow, and a
    // hard-coded loop bound silently turned into a fake failure once already.
    for (let i = 0; i < 200; i++) {
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

  const promptText = await txt(page, '.card');
  await page.locator('.play__stage .btn--primary').click();
  await page.waitForSelector('.slot__input');
  const stillVisible = (await page.locator('.reminder__text').count()) > 0
    ? await txt(page, '.reminder__text')
    : '';
  check(
    'the prompt stays visible while writing',
    stillVisible === promptText,
    `prompt "${promptText.slice(0, 30)}" vs reminder "${stillVisible.slice(0, 30)}"`,
  );
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
  await page.locator('.stopped .btn').click();
  await page.waitForSelector('.decks', { timeout: 10000 });

  // ---------- Compare ----------
  await open('One Question');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.answer');
  await snap(page, 'compare-answer');
  await page.locator('.answer').fill('answer from the first person');
  await page.locator('.play__stage--form .btn--primary').click();
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 5000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.answer');
  const secondBlank = await page.locator('.answer').inputValue();
  check('the second person starts from a blank field', secondBlank === '', secondBlank);
  await page.locator('.answer').fill('answer from the second person');
  await page.locator('.play__stage--form .btn--primary').click();
  await page.waitForSelector('.compare__side');
  const bothShown = await txt(page, '.compare');
  check(
    'compare reveals both answers together',
    bothShown.includes('first person') && bothShown.includes('second person'),
  );
  await snap(page, 'compare-reveal');
  await home();

  // ---------- Scale ----------
  await open('Rate the Scenario');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.scale');
  await snap(page, 'scale-rate');
  await page.locator('.scale__btn').nth(9).click();
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 5000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.scale');
  await page.locator('.scale__btn').nth(3).click();
  await page.waitForSelector('.gapnum');
  const gapShown = await txt(page, '.gapnum');
  check('gap is shown before the numbers', gapShown === '6', gapShown);
  const numbersHidden = (await page.locator('.scores').count()) === 0;
  check('the raw numbers are not shown yet', numbersHidden);
  await snap(page, 'scale-gap');
  await page.locator('.play__stage .btn--primary').click();
  await page.waitForSelector('.scores');
  check('numbers appear on the second tap', true);
  await snap(page, 'scale-numbers');
  await home();

  // ---------- Builder ----------
  await open('Touch Dice');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.rolled');
  const slotCount2 = await page.locator('.rolled').count();
  check('builder rolls every slot', slotCount2 >= 3, `${slotCount2} slots`);
  const before = await page.locator('.rolled__value').allInnerTexts();
  await snap(page, 'builder-rolled');
  // Reroll one slot until it changes, then confirm the others held.
  let changedOne = false;
  for (let i = 0; i < 12 && !changedOne; i++) {
    await page.locator('.rolled__reroll').first().click();
    const after = await page.locator('.rolled__value').allInnerTexts();
    if (after[0] !== before[0]) {
      changedOne = after.slice(1).every((v, idx) => v === before[idx + 1]);
      check('rerolling one part leaves the others alone', changedOne);
    }
  }
  if (!changedOne) check('rerolling one part leaves the others alone', false, 'never changed');
  await home();

  // ---------- Vault ----------
  await open('The Vault');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.vault');
  await page.locator('.vault .btn--primary').click();
  await page.waitForSelector('.answer');
  await page.locator('.answer').fill('one hour, no phones, their choice');
  await page.locator('.play__stage--form .btn--primary').click();
  await page.waitForSelector('.iou');
  check('a written promise appears in the vault', (await page.locator('.iou').count()) === 1);
  await snap(page, 'vault-list');
  await page.locator('.iou .btn--primary').click();
  await page.waitForTimeout(200);
  const stillOpen = await page.locator('.iou').count();
  check('redeeming moves it out of the open list', stillOpen === 0, `${stillOpen} still open`);
  const redeemed = await txt(page, '.vault');
  check('redeemed items are still readable', /redeemed/i.test(redeemed));
  await snap(page, 'vault-redeemed');
  await home();

  // ---------- Endurance ----------
  await open('First to Break');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.clock');
  const c1 = await txt(page, '.card');
  check('a constraint is drawn', c1.length > 0);
  await snap(page, 'endurance-turn');
  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForTimeout(200);
  const activeAfter = await txt(page, '.play__eyebrow');
  check('swapping changes who is active', /lily/i.test(activeAfter), activeAfter);
  await page.locator('.play__actions .btn--primary').click();
  await page.waitForSelector('.stopped__title');
  const endur = await txt(page, '.stopped');
  check('giving in ends the game with a named outcome', /broke first|draw/i.test(endur));
  await snap(page, 'endurance-over');
  await page.locator('.stopped .btn').click();
  await page.waitForSelector('.decks', { timeout: 10000 });
  const finalCount = await page.locator('.deckcard').count();
  check('every deck is reachable from home', finalCount >= 29, `${finalCount} decks listed`);

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
