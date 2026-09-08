#!/usr/bin/env node
/**
 * Screenshot + layout-assertion harness.
 *
 * Standing practice from prior builds: headless is necessary but is NOT the
 * device. It reports env(safe-area-inset-*) as 0 and cannot see touch behavior,
 * so this harness catches layout breaks and Noah stays device QA for the rest.
 *
 * Assertions are the point. Eyeballing screenshots misses horizontal overflow
 * every time, so we measure it instead.
 *
 * Usage:  npm run build && npm run preview &   then   npm run shots
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE = process.env.SHOT_BASE ?? 'http://localhost:4173/lantern/';
const OUT = path.resolve('shots');

// Narrowest realistic target first. If it survives 360, it survives the rest.
const TARGETS = [
  { name: '360-narrow', viewport: { width: 360, height: 780 }, dpr: 3 },
  { name: '390-iphone', viewport: { width: 390, height: 844 }, dpr: 3 },
  { name: '768-tablet', viewport: { width: 768, height: 1024 }, dpr: 2 },
];

const failures = [];

async function shoot(browser, target) {
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: target.viewport,
    deviceScaleFactor: target.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('main');

  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  if (overflow !== 0) {
    failures.push(`${target.name}: horizontal overflow of ${overflow}px`);
  }

  if (consoleErrors.length > 0) {
    failures.push(`${target.name}: console errors -> ${consoleErrors.join(' | ')}`);
  }

  await page.screenshot({
    path: path.join(OUT, `${target.name}.png`),
    fullPage: true,
  });

  await ctx.close();
  console.log(`  shot ${target.name}: overflow=${overflow}px, console errors=${consoleErrors.length}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const t of TARGETS) await shoot(browser, t);
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error('\nlayout assertions FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nall layout assertions passed. shots in ${OUT}`);
  console.log('NOTE: safe-area insets read 0 headless. Device QA still required.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
