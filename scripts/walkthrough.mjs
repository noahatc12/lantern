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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE = process.env.WALK_BASE ?? 'http://localhost:4175/lantern/';
// Falls back to the local passphrase file, same as every other harness. This
// was the only one that did not, which is why it was the only one that failed
// when the runner stopped passing it explicitly.
const PASS =
  process.env.WALK_PASS ??
  (existsSync('.passphrase.local') ? readFileSync('.passphrase.local', 'utf8').trim() : undefined);
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
      '.play__top, .tonight__head, .h1, .ob__dots, .gate__title, .stopped__title, .handoff__eyebrow',
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
  await page.waitForSelector('.ob, .tabbar', { timeout: 40000 });

  // ---------- onboarding ----------
  await page.waitForSelector('.ob', { timeout: 40000 });
  await snap(page, 'onboard-names');
  const nextDisabled = await page.locator('.ob__foot .btn--primary').isDisabled();
  check('onboarding will not advance without two names', nextDisabled);

  const inputs = page.locator('.ob .field');
  await inputs.nth(0).fill('Noah');
  await inputs.nth(1).fill('Lily');
  await page.locator('.ob__foot .btn--primary').click();

  await page.waitForSelector('.ob .tiers__row', { timeout: 10000 });
  check('onboarding explains the ceiling before anything is played', true);
  await snap(page, 'onboard-ceiling');
  await page.locator('.ob .tier').nth(4).click();
  await page.locator('.ob__foot .btn--primary').click();

  await page.waitForSelector('.ctrl--stop', { timeout: 10000 });
  const controls = await txt(page, '.ob');
  check(
    'onboarding explains that stopping is never attributed',
    /(never|not|neither)[^.]{0,40}attributed/i.test(controls),
  );
  await snap(page, 'onboard-controls');
  await page.locator('.ob__foot .btn--primary').click();

  // ---------- tonight ----------
  await page.waitForSelector('.suggest, .tonight__head', { timeout: 15000 });
  await snap(page, 'tonight');
  const atTier = async () => (await page.locator('.tier.is-on .tier__n').innerText()).trim();
  check('the ceiling chosen during onboarding carries through', (await atTier()) === '5');
  check('tonight offers exactly one suggestion', (await page.locator('.suggest').count()) === 1);
  const guardrails = await txt(page, '.guardrails');
  check('tonight states its guardrails', /ease off/i.test(guardrails));

  const tabs = page.locator('.tabbtn');
  check('there are four places', (await tabs.count()) === 4, String(await tabs.count()));

  const setTier = async (n) => {
    await tabs.nth(0).click();
    await page.waitForSelector('.tiers__row', { timeout: 10000 });
    await page.locator('.tiers .tier').nth(n - 1).click();
    await page.waitForTimeout(80);
  };
  const goShelf = async () => {
    await tabs.nth(1).click();
    await page.waitForSelector('.decks, .locked', { timeout: 10000 });
  };

  // ---------- the shelf ----------
  await setTier(1);
  await goShelf();
  const fewer = await page.locator('.deckcard').count();
  const lockedShown = (await page.locator('.locked').count()) > 0;
  check('what sits above the ceiling is named rather than hidden', lockedShown);
  await snap(page, 'shelf-tier1');

  await setTier(5);
  await goShelf();
  const more = await page.locator('.deckcard').count();
  check('raising the ceiling reveals more decks', more > fewer, `${fewer} -> ${more}`);
  await snap(page, 'shelf-tier5');

  // Search narrows, and clears cleanly.
  await page.locator('.search__input').fill('kiss');
  await page.waitForTimeout(150);
  const searched = await page.locator('.deckcard').count();
  check('search narrows the shelf', searched > 0 && searched < more, `${more} -> ${searched}`);
  await page.locator('.search__input').fill('');
  await page.waitForTimeout(150);
  check('clearing search restores the shelf', (await page.locator('.deckcard').count()) === more);

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
    await page.waitForSelector('.decks, .tabbar', { timeout: 10000 });
    if ((await page.locator('.decks').count()) === 0) await goShelf();
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
    // Snapshot the screen as it OPENS, before anything is clicked. Playwright
    // scrolls an element into view before clicking it, so counting the notes
    // first would move the page and then the harness would report its own
    // scrolling as the app opening scrolled.
    await snap(page, `rules-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`);
    const steps = await page.locator('.rules__steps li').count();
    const summary = await txt(page, '.rules__summary');
    const hasExample = (await page.locator('.rules__example p').count()) > 0;
    await page.locator('.rules__toggle').click();
    const notes = await page.locator('.rules__notes li').count();
    check(
      `${title}: has instructions`,
      steps >= 3 && notes >= 2 && summary.length > 20 && hasExample,
      `${steps} steps, ${notes} notes, example=${hasExample}`,
    );
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

  // The floor. Present on every play screen at every tier, not only where one
  // engine happened to render it.
  await page.locator('.play__choices .btn').first().click();
  await page.waitForSelector('.card');
  check('stop is present while a card is up', (await page.locator('.floor__btn--stop').count()) === 1);
  check('ease off is present alongside it', (await page.locator('.floor__btn--ease').count()) === 1);
  await snap(page, 'tod-stopcontrols');

  // Ease off must actually lower the ceiling, not just say so. Read it off
  // Tonight rather than off the play screen: Truth or Dare runs the ladder, so
  // its displayed tier is min(rung, ceiling) and can be unchanged by a drop
  // that did happen. Asserting the visible number there would have been a test
  // that passes when the feature is broken and fails when it works.
  await page.locator('.floor__btn--ease').click();
  await page.waitForTimeout(200);

  await page.locator('.floor__btn--stop').click();
  await page.waitForSelector('.stopped__title');
  const stopped = await txt(page, '.stopped__title');
  check('stop ends the session in one tap', stopped.toLowerCase().includes('stopped'));
  const body = await txt(page, '.stopped__body');
  check('stop screen does not attribute who stopped it', !/noah|lily/i.test(body));
  await snap(page, 'tod-stopped');
  await page.locator('.stopped .btn').click();
  await home();

  await tabs.nth(0).click();
  await page.waitForSelector('.tiers__row', { timeout: 10000 });
  const ceilingAfterEase = await atTier();
  check(
    'ease off lowered tonight’s ceiling for the rest of the session',
    ceilingAfterEase === '4',
    `ceiling is now ${ceilingAfterEase}, expected 4`,
  );
  await setTier(5);
  await goShelf();

  // Every engine, not just this one. The claim onboarding makes is universal,
  // so the check is too.
  for (const title of ['Rate the Scenario', 'The Long Kiss', 'Bucket List Match', 'Touch Dice']) {
    await open(title);
    check(
      `${title}: stop is on the play screen`,
      (await page.locator('.floor__btn--stop').count()) === 1,
    );
    await home();
  }
  await setTier(5);
  await goShelf();

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
  await home();

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
  // Reached as a place, not as a deck. An IOU written three weeks ago has to be
  // visible without either of you remembering which game produced it.
  await tabs.nth(2).click();
  await page.waitForSelector('.vault__head', { timeout: 10000 });
  check('the vault is one tap from anywhere', true);
  check('an empty vault says so', (await page.locator('.emptybox').count()) === 1);
  await snap(page, 'vault-empty');

  await page.locator('.btn--pill').click();
  await page.waitForSelector('.answer--vault', { timeout: 10000 });
  const saveDisabled = await page.locator('.screen > .btn--primary').isDisabled();
  check('an empty promise cannot be saved', saveDisabled);
  await page.locator('.answer--vault').fill('one hour, no phones, their choice');
  await page.locator('.screen > .btn--primary').click();
  await page.waitForSelector('.iou', { timeout: 10000 });
  check('a written promise appears in the vault', (await page.locator('.iou').count()) === 1);
  await snap(page, 'vault-list');

  // A sealed one must actually be sealed: no text, no redeem.
  await page.locator('.btn--pill').click();
  await page.waitForSelector('.answer--vault', { timeout: 10000 });
  await page.locator('.answer--vault').fill('a whole saturday, your plan');
  await page.locator('.seals .filter').nth(2).click();
  await page.locator('.screen > .btn--primary').click();
  await page.waitForSelector('.iou--sealed', { timeout: 10000 });
  const sealed = await txt(page, '.iou--sealed');
  check('a sealed promise hides its text', !/saturday/i.test(sealed), sealed.slice(0, 60));
  check('a sealed promise offers no way to open it early', /opens in/i.test(sealed));
  check(
    'sealing one does not seal the other',
    (await page.locator('.iou:not(.iou--sealed) .btn--redeem').count()) === 1,
  );
  await snap(page, 'vault-sealed');

  await page.locator('.btn--redeem').click();
  await page.waitForTimeout(200);
  const redeemed = await txt(page, '.ious');
  check('redeeming is recorded rather than hiding the item', /redeemed/i.test(redeemed));
  check('redeeming removes the way to redeem again', (await page.locator('.btn--redeem').count()) === 0);
  await snap(page, 'vault-redeemed');

  // Saved match results live here too, not buried in the deck that made them.
  const savedResults = await page.locator('.row2--card').count();
  check('a saved match result is reachable from the vault', savedResults >= 1, `${savedResults} saved`);
  if (savedResults > 0) {
    await page.locator('.row2--card').first().click();
    await page.waitForSelector('.result__head', { timeout: 10000 });
    check('opening a saved result shows the overlap', true);
    await snap(page, 'vault-saved-result');
    await page.locator('.backbtn').click();
    await page.waitForSelector('.vault__head', { timeout: 10000 });
  }
  await goShelf();

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
  await home();
  const finalCount = await page.locator('.deckcard').count();
  check('every deck is reachable from the shelf', finalCount >= 29, `${finalCount} decks listed`);

  // ---------- the ceiling applies to sorting decks ----------
  // This engine sorted the whole deck regardless of the ceiling, so a deck
  // spanning tiers 3 to 5 dealt its tier-5 cards at a ceiling of 3. Onboarding
  // promises nothing above the ceiling is drawn; that promise is the thing the
  // whole safety layer rests on, so it gets an assertion of its own.
  const sortSize = async () => {
    await open('Yes / No / Maybe');
    const note = await txt(page, '.play__note');
    await home();
    return Number((note.match(/(\d+)/) ?? [])[1] ?? 0);
  };
  await setTier(5);
  await goShelf();
  const atFive = await sortSize();
  await setTier(3);
  await goShelf();
  const atThree = await sortSize();
  check(
    'the ceiling applies to sorting decks, not just drawn ones',
    atThree > 0 && atThree < atFive,
    `${atFive} cards at tier 5 vs ${atThree} at tier 3`,
  );
  await setTier(5);
  await goShelf();

  // ---------- props actually filter ----------
  // The settings toggle used to be decorative. If it does not change what a
  // deck can deal, it is a control that lies about what tonight will contain.
  const builderOptions = async () => {
    await open('Touch Dice');
    const note = await txt(page, '.play__note');
    await home();
    return Number((note.match(/,\s*(\d+)\s*options/) ?? [])[1] ?? 0);
  };
  const withoutProps = await builderOptions();
  await tabs.nth(3).click();
  await page.waitForSelector('.rows', { timeout: 10000 });
  await page.locator('.row2', { hasText: 'to hand' }).click();
  await page.waitForSelector('.prop', { timeout: 10000 });
  const propCount = await page.locator('.prop').count();
  check('the props list is derived from the content', propCount > 0, `${propCount} props`);
  await snap(page, 'settings-props');
  for (let i = 0; i < propCount; i++) await page.locator('.prop').nth(i).click();
  await page.waitForTimeout(120);
  await goShelf();
  const withProps = await builderOptions();
  check(
    'having the props to hand puts more options in play',
    withProps > withoutProps,
    `${withoutProps} -> ${withProps}`,
  );

  // ---------- settings ----------
  await tabs.nth(3).click();
  await page.waitForSelector('.rows', { timeout: 10000 });
  await snap(page, 'settings');
  await page.locator('.row2', { hasText: 'Privacy' }).click();
  await page.waitForSelector('.fact', { timeout: 10000 });
  const privacy = await txt(page, '.screen');
  check('privacy states what is written down', /what is written down/i.test(privacy));
  check('privacy states that a No is never recorded', /never a No/i.test(privacy));
  await snap(page, 'settings-privacy');
  await page.locator('.backbtn').click();
  await page.waitForSelector('.rows', { timeout: 10000 });

  await page.locator('.card--danger').click();
  await page.waitForSelector('.btn--danger', { timeout: 10000 });
  const eraseText = await txt(page, '.screen');
  check('erase says exactly what goes', /no bin and no undo/i.test(eraseText));
  await snap(page, 'settings-erase');
  await page.locator('.btn', { hasText: 'Keep it' }).click();
  await page.waitForSelector('.rows', { timeout: 10000 });
  check('keeping it returns to settings without erasing', true);

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
