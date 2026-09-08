#!/usr/bin/env node
/**
 * Accessibility scan across the real screens.
 *
 * Contrast, names, roles and landmarks, checked by axe rather than by me
 * looking at it. Half of this app is used in a dark room by someone who did not
 * write it, so "I can read it on my monitor" is not the bar.
 */

import { readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = process.env.A11Y_BASE ?? 'http://localhost:4176/lantern/';
const PASS = process.env.A11Y_PASS ?? readFileSync('.passphrase.local', 'utf8').trim();

const all = [];

async function scan(page, name) {
  // Let entrance animations finish. Scanning mid-fade reports the CONTENT as a
  // contrast failure, which is an artifact of measuring a half-drawn frame.
  await page.waitForTimeout(600);
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  for (const v of res.violations) {
    all.push({
      screen: name,
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 110)),
    });
  }
  console.log(`  ${name}: ${res.violations.length} violation(s)`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate__input', { timeout: 20000 });
  await scan(page, 'unlock');

  await page.fill('.gate__input', PASS);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.gate__input').length === 2, { timeout: 40000 });
  await scan(page, 'names');

  const inputs = page.locator('.gate__input');
  await inputs.nth(0).fill('Noah');
  await inputs.nth(1).fill('Lily');
  await page.click('.btn--primary');
  await page.waitForSelector('.decks', { timeout: 15000 });
  await page.locator('.tier').nth(4).click();
  await scan(page, 'home');

  await page.locator('.deckcard__title', { hasText: 'Truth or Dare' }).click();
  await page.waitForSelector('.rules', { timeout: 10000 });
  await scan(page, 'rules');

  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.play__turn', { timeout: 10000 });
  await scan(page, 'turn');

  await page.locator('.play__choices .btn').first().click();
  await page.waitForSelector('.card', { timeout: 10000 });
  await scan(page, 'card');

  await page.locator('.play__back').first().click();
  await page.waitForSelector('.decks', { timeout: 10000 });
  await page.locator('.deckcard__title', { hasText: 'Bucket List Match' }).click();
  await page.waitForSelector('.rules', { timeout: 10000 });
  await page.locator('.rules__actions .btn--primary').click();
  await page.waitForSelector('.sort', { timeout: 10000 });
  await scan(page, 'sorting');

  await browser.close();

  console.log('');
  if (all.length === 0) {
    console.log('no accessibility violations.');
    return;
  }

  const seen = new Set();
  for (const v of all) {
    const key = v.screen + v.id;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`[${v.impact}] ${v.screen}: ${v.id} - ${v.help}`);
    for (const n of v.nodes) console.error(`    ${n}`);
  }
  console.error(`\n${all.length} violation(s) total.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
