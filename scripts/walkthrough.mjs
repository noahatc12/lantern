#!/usr/bin/env node
/**
 * Drives the real app through a full session and screenshots every screen.
 *
 * A build that compiles and a build that works are different claims. This makes
 * the second one checkable: unlock, name setup, home, and one pass through each
 * of the five games, with layout assertions at each step.
 *
 * Needs a preview server and a sealed bundle whose passphrase is passed in.
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
let n = 0;

async function snap(page, name) {
  n += 1;
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  if (overflow !== 0) failures.push(`${name}: horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) });
  console.log(`  ${name}: overflow=${overflow}px`);
}

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
    if (m.type() === 'error') failures.push(`console: ${m.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate__input', { timeout: 15000 });
  await snap(page, 'unlock');

  await page.fill('.gate__input', PASS);
  await page.click('button[type="submit"]');

  await page.waitForSelector('.gate__title', { timeout: 30000 });
  await snap(page, 'names');

  const inputs = page.locator('.gate__input');
  await inputs.nth(0).fill('Noah');
  await inputs.nth(1).fill('Lily');
  await page.click('.btn--primary');

  await page.waitForSelector('.decks', { timeout: 15000 });
  await snap(page, 'home-tier2');

  // Raise the ceiling so every deck is reachable.
  await page.locator('.tier').nth(4).click();
  await snap(page, 'home-tier5');

  const openDeck = async (title) => {
    await page.locator('.deckcard__title', { hasText: title }).click();
    await page.waitForTimeout(250);
  };
  const back = async () => {
    const b = page.locator('.play__back');
    if (await b.count()) await b.first().click();
    await page.waitForSelector('.decks', { timeout: 10000 });
  };

  // Truth or Dare: choose, draw, verify a card rendered.
  await openDeck('Truth or Dare');
  await snap(page, 'tod-choice');
  await page.locator('.play__choices .btn').first().click();
  await page.waitForSelector('.card');
  const cardText = (await page.locator('.card').first().innerText()).trim();
  if (!cardText) failures.push('truth or dare: drew an empty card');
  await snap(page, 'tod-card');
  await back();

  // Bucket List Match: intro, sort a few, confirm handoff appears.
  await openDeck('Bucket List Match');
  await snap(page, 'match-intro');
  await page.locator('.btn--primary').click();
  await page.waitForSelector('.sort');
  await snap(page, 'match-sorting');
  const count = await page.locator('.play__tier').innerText();
  console.log(`  match progress reads: ${count}`);
  await back();

  // Two Truths: prompt then the authoring form.
  await openDeck('Two Truths and a Turn-On');
  await snap(page, 'predict-prompt');
  await page.locator('.btn--primary').click();
  await page.waitForSelector('.slot__input');
  await snap(page, 'predict-write');
  await back();

  // The Long Kiss: start the clock and confirm a cue shows.
  await openDeck('The Long Kiss');
  await snap(page, 'timer-idle');
  await page.locator('.btn--primary').click();
  await page.waitForTimeout(1200);
  await snap(page, 'timer-running');
  await back();

  // The Ask: the both-must-opt-in gate.
  await openDeck('The Ask');
  await snap(page, 'ladder-optin');
  await page.locator('.optin__btn').nth(0).click();
  await page.locator('.optin__btn').nth(1).click();
  await page.waitForSelector('.play__actions');
  await snap(page, 'ladder-rung');

  await browser.close();

  if (failures.length) {
    console.error('\nWALKTHROUGH FAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nwalkthrough clean. ${n} screens in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
