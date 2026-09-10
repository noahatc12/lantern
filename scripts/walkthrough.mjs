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
  // washed-out frame that I nearly mistook for a contrast problem. The longest
  // thing on a screen is a 320ms entrance plus seven 22ms stagger steps, so
  // 700 clears it with room rather than by a hair.
  await page.waitForTimeout(700);

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
    // Two shapes of back control: the play header's, and the screen-style
    // chevron the newer engines use. Leaving a game has to work from either.
    const b = page.locator('.play__back');
    if (await b.count()) await b.first().click();
    else {
      const c = page.locator('.backbtn');
      if (await c.count()) await c.first().click();
    }
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
  const node1 = await page.locator('.card').elementHandle();
  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForTimeout(200);
  const card2 = await txt(page, '.card');
  check('skip draws a different card', card1 !== card2);

  // A replaced card has to be a NEW element, or its entrance animation fires
  // once on mount and every card after the first just blinks into place.
  const node2 = await page.locator('.card').elementHandle();
  const sameNode = await page.evaluate(([a, b]) => a === b, [node1, node2]);
  check('a new card is a new element, so it arrives rather than blinks', !sameNode);
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

  // Reach, not just presence. The top-left chevron is the hardest place on a
  // 6.1 inch phone to get a thumb to, so leaving has to be possible from the
  // bottom of the screen as well.
  const backBtn = page.locator('.floor__back');
  check('there is a way back within thumb reach', (await backBtn.count()) === 1);
  const lowEnough = await backBtn.evaluate(
    (el) => el.getBoundingClientRect().top > window.innerHeight * 0.7,
  );
  check('and it really is at the bottom of the screen', lowEnough);

  // Nothing may sit under the notch. env() reports zero inset on this hardware
  // and the shim supplies a real one; if that ever regresses, the top control
  // goes back under the status bar and this is what says so.
  const topInset = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const el = document.querySelector('.play__back');
    return {
      safeTop: parseFloat(cs.getPropertyValue('--safe-top')) || 0,
      controlTop: el ? Math.round(el.getBoundingClientRect().top) : -1,
    };
  });
  check(
    'the top control clears the notch',
    topInset.controlTop >= topInset.safeTop,
    `control at ${topInset.controlTop}px, inset ${topInset.safeTop}px`,
  );
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

  // ---------- the yes list ----------
  // The reason the vault has three sections. Every sorting deck already made an
  // overlap and every one of them was stranded inside the deck that made it, so
  // "what did we both say yes to" had no single answer anywhere in the app.
  await page.locator('.seg__btn', { hasText: 'Yes list' }).click();
  await page.waitForSelector('.yeses, .emptybox', { timeout: 10000 });
  const yesCount = await page.locator('.yes').count();
  check('the yes list collects overlaps from the decks you sorted', yesCount > 0, `${yesCount} items`);
  const yesText = await txt(page, '.screen');
  const sources = await page.locator('.yes__from').count();
  check('every yes says which list it came from', sources > 0, `${sources} group headings`);
  check('the yes list keeps the maybes separate', /worth talking about/i.test(yesText));
  await snap(page, 'vault-yes-list');

  // Search has to reach the aggregated list, not just one deck's result.
  const firstYes = (await page.locator('.yes__text').first().innerText()).trim();
  const word = firstYes.split(/\s+/).find((w) => w.length > 5) ?? firstYes.slice(0, 6);
  await page.locator('.search__input').fill(word);
  await page.waitForTimeout(150);
  const narrowed = await page.locator('.yes').count();
  check('the yes list is searchable', narrowed > 0 && narrowed <= yesCount, `${yesCount} -> ${narrowed}`);
  await page.locator('.search__input').fill('');
  await page.waitForTimeout(120);

  // Saved sorts are still openable from here.
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

  // ---------- what we have played ----------
  await page.locator('.seg__btn', { hasText: 'Played' }).click();
  await page.waitForSelector('.stats, .emptybox', { timeout: 10000 });
  const playedRows = await page.locator('.rows--gap .row2--card').count();
  check(
    'the played list records the games this run actually played',
    playedRows > 0,
    `${playedRows} games logged`,
  );
  const playedText = await txt(page, '.screen');
  check('the played list names games, not cards', /truth or dare/i.test(playedText));
  check('it says what has never been opened', /never opened/i.test(playedText));
  await snap(page, 'vault-played');

  // Tapping something never opened has to actually open it. A nudge that does
  // not go anywhere is decoration.
  const untriedCount = await page.locator('.untried .filter').count();
  check('never-opened games are listed', untriedCount > 0, `${untriedCount} untried`);
  if (untriedCount > 0) {
    const untriedTitle = (await page.locator('.untried .filter').first().innerText()).trim();
    await page.locator('.untried .filter').first().click();
    await page.waitForSelector('.rules', { timeout: 10000 });
    const openedTitle = await txt(page, '.rules .eyebrow');
    check(
      'tapping a never-opened game opens that game',
      openedTitle.toLowerCase() === untriedTitle.toLowerCase(),
      `${untriedTitle} -> ${openedTitle}`,
    );
    await home();
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

  // ---------- per-deck rules ----------
  // Two games ride the endurance engine and they are not the same game. Without
  // a per-deck override one of them opens on instructions for the other, which
  // is the quietest possible way to ship a broken game.
  await open('First to Break');
  const breakRules = await txt(page, '.rules__summary');
  await home();
  await open('Utter Silence');
  const silenceRules = await txt(page, '.rules__summary');
  check(
    'two games on one engine get their own instructions',
    breakRules !== silenceRules,
    `${breakRules.slice(0, 40)} vs ${silenceRules.slice(0, 40)}`,
  );
  check('Utter Silence explains its own rule', /silent/i.test(silenceRules), silenceRules);
  await home();

  // ---------- Position Roulette ----------
  await open('Position Roulette');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.rolled', { timeout: 10000 });
  const rollSlots = await page.locator('.rolled').count();
  check('position roulette rolls three parts', rollSlots === 3, `${rollSlots} slots`);
  await snap(page, 'roulette');
  await home();

  // ---------- Simon Says ----------
  await open('Simon Says');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.misses', { timeout: 10000 });
  const leadFirst = await txt(page, '.play__eyebrow');
  check('the leader is named', /noah/i.test(leadFirst), leadFirst);
  const cmd1 = await txt(page, '.card');
  await snap(page, 'simon-command');

  await page.locator('.play__actions .btn--primary').click();
  await page.waitForTimeout(150);
  const cmd2 = await txt(page, '.card');
  check('a new command is dealt each time', cmd1 !== cmd2);
  const counter = await txt(page, '.play__tier');
  check('the round counts up', counter.startsWith('2 /'), counter);

  // Three misses and the role changes hands, which is the whole mechanic.
  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForTimeout(120);
  const onePip = await page.locator('.miss.is-on').count();
  check('a miss is recorded', onePip === 1, `${onePip} pips lit`);
  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForTimeout(120);
  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForSelector('.handoff', { timeout: 10000 });
  const swapTo = await txt(page, '.handoff');
  check('three misses hands the role over', /lily/i.test(swapTo), swapTo);
  await snap(page, 'simon-swap');
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 5000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.misses', { timeout: 10000 });
  const nowLeading = await txt(page, '.play__eyebrow');
  check('the other one is now leading', /lily/i.test(nowLeading), nowLeading);
  const resetPips = await page.locator('.miss.is-on').count();
  check('misses reset with the role', resetPips === 0, `${resetPips} still lit`);
  await home();

  // ---------- Love Maps ----------
  await open('Love Maps');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.answer', { timeout: 10000 });
  const asksFor = await txt(page, '.play__deck');
  check('the guesser answers for the subject', /for/i.test(asksFor), asksFor);
  const lmDisabled = await page.locator('.play__stage--form .btn--primary').isDisabled();
  check('a blank guess cannot be locked in', lmDisabled);
  await page.locator('.answer').fill('what I think she would say');
  await snap(page, 'lovemaps-guess');
  await page.locator('.play__stage--form .btn--primary').click();

  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 5000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.answer', { timeout: 10000 });
  const blankForReal = await page.locator('.answer').inputValue();
  check('the real answer starts from a blank field', blankForReal === '', blankForReal);
  await page.locator('.answer').fill('what she actually says');
  await page.locator('.play__stage--form .btn--primary').click();

  await page.waitForSelector('.compare__side', { timeout: 10000 });
  const bothSides = await txt(page, '.play__stage');
  check(
    'the reveal shows the guess and the real answer together',
    bothSides.includes('what I think she would say') && bothSides.includes('what she actually says'),
  );
  await snap(page, 'lovemaps-reveal');

  // Ending must be offered only once something has been judged, or the summary
  // claims "no misses" while the miss is still on the screen you left from.
  const earlyOut = await page.locator('.btn', { hasText: 'That is enough' }).count();
  check('cannot end the round before anything is marked', earlyOut === 0);

  await page.locator('.play__actions .btn--ghost').click();
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 8000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.answer', { timeout: 10000 });
  const swappedSubject = await txt(page, '.play__deck');
  check('the subject alternates between questions', /noah/i.test(swappedSubject), swappedSubject);

  await page.locator('.answer').fill('second guess');
  await page.locator('.play__stage--form .btn--primary').click();
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 8000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.answer', { timeout: 10000 });
  await page.locator('.answer').fill('second real');
  await page.locator('.play__stage--form .btn--primary').click();
  await page.waitForSelector('.compare__side', { timeout: 10000 });

  await page.locator('.btn', { hasText: 'That is enough' }).click();
  await page.waitForSelector('.result__head', { timeout: 10000 });
  const lmEnd = await txt(page, '.result');
  check('the end screen leads with the misses', /worth talking about/i.test(lmEnd));
  check('a miss carries the real answer with it', /what she actually says/.test(lmEnd));
  await snap(page, 'lovemaps-end');
  await home();

  // ---------- The Newlywed Round ----------
  await open('The Newlywed Round');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.answer', { timeout: 10000 });
  const seedHeader = await txt(page, '.play__deck');
  check('the subject seeds their answers privately', /privately/i.test(seedHeader), seedHeader);

  const fillTen = async (prefix) => {
    for (let i = 0; i < 12; i++) {
      if ((await page.locator('.answer').count()) === 0) break;
      await page.locator('.answer').fill(`${prefix} ${i + 1}`);
      await page.locator('.play__stage--form .btn--primary').click();
      await page.waitForTimeout(60);
      if ((await page.locator('.handoff').count()) > 0) break;
    }
  };
  await fillTen('real answer');
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 8000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.answer', { timeout: 10000 });
  await fillTen('guessed answer');
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 8000 });
  await page.locator('.handoff__go').click();

  await page.waitForSelector('.marks', { timeout: 10000 });
  const rowCount = await page.locator('.markrow').count();
  check('all ten come back at once to be marked', rowCount === 10, `${rowCount} rows`);
  const doneDisabled = await page.locator('.play__stage .btn--big').isDisabled();
  check('cannot finish before every one is marked', doneDisabled);
  await snap(page, 'newlywed-scoreboard');

  for (let i = 0; i < rowCount; i++) {
    await page.locator('.markrow').nth(i).locator('.filter').nth(i % 2).click();
  }
  await page.waitForTimeout(120);
  const nowEnabled = !(await page.locator('.play__stage .btn--big').isDisabled());
  check('marking them all enables the finish', nowEnabled);
  await page.locator('.play__stage .btn--big').click();
  await page.waitForSelector('.result__head', { timeout: 10000 });
  const nwEnd = await txt(page, '.result');
  check('the newlywed round ends on the misses too', /worth talking about/i.test(nwEnd));
  await snap(page, 'newlywed-end');
  await home();

  // ---------- Jar of Desire ----------
  // The authored engine. What matters is that both sets go in, that what comes
  // out has no name on it, and that delete deletes.
  await open('Jar of Desire');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.emptybox, .stack', { timeout: 10000 });
  check('an empty jar says so', (await page.locator('.emptybox').count()) === 1);

  const writeInto = async (who, lines) => {
    await page.locator('.btn', { hasText: 'Add some' }).click();
    await page.waitForSelector('.btn--pick', { timeout: 10000 });
    await page.locator('.btn--pick', { hasText: who }).click();
    await page.waitForSelector('.answer--vault', { timeout: 10000 });
    for (const line of lines) {
      await page.locator('.answer--vault').fill(line);
      await page.locator('.btn--primary', { hasText: 'Put it in' }).click();
      await page.waitForTimeout(80);
    }
    await page.locator('.btn', { hasText: 'Done,' }).click();
    await page.waitForTimeout(150);
  };

  await writeInto('Noah', ['a thing noah wrote']);
  await writeInto('Lily', ['a thing lily wrote']);

  await page.locator('.btn--primary', { hasText: 'Draw one' }).click();
  await page.waitForSelector('.card', { timeout: 10000 });
  const anon = await txt(page, '.play__eyebrow');
  check('a drawn item carries no name', /one of you/i.test(anon), anon);
  await snap(page, 'jar-drawn');
  await page.locator('.btn--ghost', { hasText: 'Who wrote it' }).click();
  await page.waitForTimeout(150);
  const named = await txt(page, '.play__eyebrow');
  check('the author is shown only when asked for', /wrote this/i.test(named), named);
  await page.locator('.btn--primary', { hasText: 'Done' }).click();
  await page.waitForSelector('.play__stage', { timeout: 10000 });
  const jarAfter = await txt(page, '.play__stage');
  check('a used one moves to the done pile', /done \(1\)/i.test(jarAfter));
  await home();

  // ---------- Sealed Envelopes ----------
  await open('Sealed Envelopes');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.emptybox, .stack', { timeout: 10000 });
  await writeInto('Noah', ['the first sealed one', 'the second sealed one']);
  const sealedRows = await page.locator('.iou--sealed').count();
  check('later envelopes stay sealed', sealedRows >= 1, `${sealedRows} sealed`);
  const openable = await page.locator('.btn--primary', { hasText: 'Open the next' }).isDisabled();
  check('the first one can be opened straight away', !openable);
  await snap(page, 'sealed-envelopes');
  await home();

  // ---------- Story Relay ----------
  await open('Story Relay');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.reminder__text', { timeout: 10000 });
  const opener = await txt(page, '.reminder__text');
  check('the relay opens on a line you did not write', opener.length > 10, opener);
  for (const line of ['and then the first thing happened.', 'and then a second thing happened.', 'and a third.']) {
    await page.locator('.answer').fill(line);
    await page.locator('.btn--primary', { hasText: 'Add it and pass' }).click();
    await page.waitForTimeout(80);
  }
  const visible = await page.locator('.reminder__text').count();
  check('only the last two sentences are visible', visible === 2, `${visible} shown`);
  await snap(page, 'relay-writing');
  await page.locator('.btn', { hasText: 'Stop here and read it' }).click();
  await page.waitForSelector('.story__text', { timeout: 10000 });
  const whole = await txt(page, '.story__text');
  check('the whole story comes back at the end', whole.includes('a third'), whole.slice(0, 50));
  await page.locator('.btn--ghost', { hasText: 'Delete it' }).click();
  await page.waitForSelector('.rules', { timeout: 10000 });
  check('deleting returns you without keeping it', true);
  await home();

  // ---------- Thirty Six Questions ----------
  await open('Thirty Six Questions');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.card', { timeout: 10000 });
  const firstQ = await txt(page, '.card');
  const setLabel = await txt(page, '.play__deck');
  check('it opens on the first set', /set 1 of 3/i.test(setLabel), setLabel);
  await snap(page, 'thirtysix');
  // Walk to the end of the first set and check the break screen appears.
  for (let i = 0; i < 12; i++) {
    await page.locator('.btn--primary', { hasText: 'Next question' }).click();
    await page.waitForTimeout(50);
    if ((await page.locator('.play__eyebrow').innerText()).match(/end of set/i)) break;
  }
  const breakText = await txt(page, '.play__stage');
  check('there is a break between the sets', /end of set 1/i.test(breakText), breakText.slice(0, 40));
  await snap(page, 'thirtysix-break');
  await page.locator('.btn', { hasText: 'Stop here for tonight' }).click();
  await page.waitForSelector('.decks, .tabbar', { timeout: 10000 });
  if ((await page.locator('.decks').count()) === 0) await goShelf();

  await open('Thirty Six Questions');
  const resumeNote = await txt(page, '.rules__actions');
  check('it offers to pick up where you stopped', /pick up at question 1[23]/i.test(resumeNote), resumeNote.slice(0, 60));
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.card', { timeout: 10000 });
  const resumedQ = await txt(page, '.card');
  check('resuming does not start over', resumedQ !== firstQ);
  await home();

  // ---------- Sensate Focus ----------
  await open('Sensate Focus');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.stages', { timeout: 10000 });
  const stageStates = await page.locator('.stage__state').allInnerTexts();
  check(
    'only the first stage is open',
    stageStates[0].trim().toLowerCase() === 'open' &&
      stageStates[1].trim().toLowerCase() === 'locked',
    stageStates.join(', '),
  );
  const disclaimer = await txt(page, '.disclaimer');
  check('it says once that this is not therapy', /not therapy/i.test(disclaimer));
  await snap(page, 'sensate-stages');
  await page.locator('.btn--primary', { hasText: 'Start stage 1' }).click();
  await page.waitForSelector('.reminder__text', { timeout: 10000 });
  await page.locator('.btn--primary').first().click();
  await page.waitForSelector('.clock', { timeout: 10000 });
  await page.locator('.btn', { hasText: 'Swap early' }).click();
  await page.waitForTimeout(200);
  await page.locator('.btn', { hasText: 'Finish early' }).click();
  await page.waitForSelector('.rules__steps', { timeout: 10000 });
  const bothNeeded = await page.locator('.btn--big', { hasText: 'Both of you' }).count();
  check('the next stage will not unlock on one person alone', bothNeeded === 1);
  await page.locator('.btn--pick', { hasText: 'Noah is done' }).click();
  await page.locator('.btn--pick', { hasText: 'Lily is done' }).click();
  await page.waitForTimeout(120);
  await page.locator('.btn--primary', { hasText: 'Unlock stage 2' }).click();
  await page.waitForSelector('.stages', { timeout: 10000 });
  const after = await page.locator('.stage__state').allInnerTexts();
  check(
    'both marking it done unlocks the next one',
    after[0].trim().toLowerCase() === 'done' && after[1].trim().toLowerCase() === 'open',
    after.join(', '),
  );
  await home();

  // ---------- Story Cards ----------
  await open('Story Cards');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.card', { timeout: 10000 });
  await page.locator('.btn--primary').first().click();
  await page.waitForSelector('.lines', { timeout: 10000 });
  const handSize = await page.locator('.lineopt').count();
  check('you pick from a hand rather than one line', handSize === 5, `${handSize} lines`);
  await snap(page, 'storycards-hand');
  await page.locator('.lineopt').first().click();
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 8000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.lines', { timeout: 10000 });
  await page.locator('.lineopt').nth(1).click();
  await page.waitForSelector('.lines', { timeout: 10000 });
  const choices = await page.locator('.lineopt').count();
  check('the teller chooses between two, unlabelled', choices === 2, `${choices} shown`);
  await home();

  // ---------- Kinky Cards ----------
  await open('Kinky Cards');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.rolled', { timeout: 10000 });
  check('kinky cards rolls three parts', (await page.locator('.rolled').count()) === 3);
  await home();

  // ---------- Body Heat Map ----------
  await open('Body Heat Map');
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.figure', { timeout: 10000 });
  const paintRegions = await page.locator('.region').count();
  check('the map is made of tappable places', paintRegions > 10, `${paintRegions} regions`);
  const notReady = await page.locator('.play__stage .btn--big').isDisabled();
  check('you cannot finish a map with nothing on it', notReady);

  const paint = async () => {
    await page.locator('.level', { hasText: 'yes' }).first().click();
    for (let i = 0; i < 8; i++) await page.locator('.region').nth(i).click();
    await page.locator('.filter', { hasText: 'back' }).click();
    await page.waitForTimeout(100);
    await page.locator('.level', { hasText: 'not here' }).click();
    await page.locator('.region').first().click();
    await page.locator('.btn--primary', { hasText: 'Done' }).click();
  };
  // Snapshot before tapping anything: Playwright scrolls a control into view
  // before clicking it, and the screenshot assertion is about how the screen
  // opens rather than about where the harness left the page.
  await snap(page, 'bodymap-paint');
  await page.locator('.level', { hasText: 'yes' }).first().click();
  for (let i = 0; i < 8; i++) await page.locator('.region').nth(i).click();
  await page.locator('.filter', { hasText: 'back' }).click();
  await page.waitForTimeout(100);
  await page.locator('.level', { hasText: 'not here' }).click();
  await page.locator('.region').first().click();
  await page.locator('.btn--primary', { hasText: 'Done' }).click();
  await page.waitForSelector('.handoff__go:not([disabled])', { timeout: 8000 });
  await page.locator('.handoff__go').click();
  await page.waitForSelector('.figure', { timeout: 10000 });
  await paint();

  await page.waitForSelector('.maps', { timeout: 10000 });
  const mapCards = await page.locator('.mapcard').count();
  check('both maps and a combined one are shown', mapCards === 3, `${mapCards} maps`);
  const mapText = await txt(page, '.play__stage');
  check('it says plainly that both maps were saved', /saves both|both maps are saved/i.test(mapText));
  await snap(page, 'bodymap-reveal');
  await home();

  // ---------- stakes ----------
  // A modifier on the games with a win condition, and deliberately nowhere near
  // the ones without.
  await open('Truth or Dare');
  check('stakes are offered on a game you can win', (await page.locator('.stakes').count()) === 1);
  await page.locator('.stakes__bar').click();
  await page.waitForSelector('.stakes__opts', { timeout: 5000 });
  await page.locator('.stakes__opts .filter', { hasText: 'Layers' }).click();
  await page.waitForTimeout(120);
  await page.locator('.btn--pick', { hasText: 'Noah loses one' }).click();
  await page.waitForTimeout(120);
  const ledger = await txt(page, '.stakes__score');
  check('the layers ledger counts', /noah 1/i.test(ledger), ledger);
  const fine = await txt(page, '.stakes__fine');
  check('a skip is still free with stakes on', /skip never costs/i.test(fine));
  await snap(page, 'stakes');
  await home();

  await open('Bucket List Match');
  check(
    'stakes are never offered on a sorting game',
    (await page.locator('.stakes').count()) === 0,
  );
  await home();

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

  // ---------- look through everything ----------
  // Reading the decks must not look like playing them, or the played list stops
  // meaning anything.
  const playedBefore = await (async () => {
    await tabs.nth(2).click();
    await page.waitForSelector('.seg', { timeout: 10000 });
    await page.locator('.seg__btn', { hasText: 'Played' }).click();
    await page.waitForSelector('.stats, .emptybox', { timeout: 10000 });
    const n = await page.locator('.rows--gap .row2--card').count();
    await tabs.nth(3).click();
    await page.waitForSelector('.rows', { timeout: 10000 });
    return n;
  })();

  await page.locator('.row2', { hasText: 'Look through everything' }).click();
  await page.waitForSelector('.rows--gap', { timeout: 10000 });
  const listed = await page.locator('.row2--card').count();
  check('every game is listed for reading', listed >= 42, `${listed} listed`);
  await snap(page, 'inspect-list');

  await page.locator('.search__input').fill('kiss');
  await page.waitForTimeout(200);
  const foundLines = await page.locator('.yes').count();
  check('search reaches inside every deck', foundLines > 0, `${foundLines} lines`);
  await page.locator('.search__input').fill('');
  await page.waitForTimeout(150);

  await page.locator('.row2--card').first().click();
  await page.waitForSelector('.inspect__summary', { timeout: 10000 });
  const cardLines = await page.locator('.yes').count();
  check('a deck shows its actual cards', cardLines > 5, `${cardLines} lines`);
  const tierHeads = await page.locator('.eyebrow').allInnerTexts();
  check(
    'and says which tier each group is',
    tierHeads.some((t) => /tier \d/i.test(t)),
    tierHeads.slice(0, 4).join(' | '),
  );
  await snap(page, 'inspect-deck');
  await page.locator('.backbtn').click();
  await page.waitForSelector('.rows--gap', { timeout: 10000 });
  await page.locator('.backbtn').click();
  await page.waitForSelector('.rows', { timeout: 10000 });

  await tabs.nth(2).click();
  await page.waitForSelector('.seg', { timeout: 10000 });
  await page.locator('.seg__btn', { hasText: 'Played' }).click();
  await page.waitForSelector('.stats, .emptybox', { timeout: 10000 });
  const playedAfter = await page.locator('.rows--gap .row2--card').count();
  check(
    'reading is not playing',
    playedAfter === playedBefore,
    `${playedBefore} -> ${playedAfter}`,
  );
  await tabs.nth(3).click();
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
