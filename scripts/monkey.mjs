#!/usr/bin/env node
/**
 * Monkey test: random interaction, continuous invariants.
 *
 * The scripted audit checks things I thought to check. Six of the seven bugs
 * that shipped today were things I did not think to check, so the audit was
 * structurally incapable of finding them. This is the counterpart: it does not
 * know what the app is supposed to do, only what must never be true of it.
 *
 * After EVERY interaction it asserts the invariant set. That is the whole idea.
 * Point assertions catch what you aimed at; continuous invariants catch what
 * you did not.
 *
 * Deterministic by seed, so a failure replays exactly:
 *   MONKEY_SEED=12345 npm run monkey
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env.MONKEY_BASE ?? 'http://localhost:4176/lantern/';
const STEPS = Number(process.env.MONKEY_STEPS ?? 400);
const SEED = Number(process.env.MONKEY_SEED ?? Math.floor(Math.random() * 1e9));
const OUT = path.resolve('shots', 'monkey');

const PASS = process.env.MONKEY_PASS ?? readFileSync('.passphrase.local', 'utf8').trim();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(SEED);
const violations = [];
const trail = [];
const screensSeen = new Set();

function violation(step, kind, detail) {
  violations.push({ step, kind, detail, trail: trail.slice(-12) });
}

/**
 * Everything that must never be true, regardless of what screen we are on.
 * Runs after every single interaction.
 */
const INVARIANTS = `() => {
  const el = document.documentElement;
  const out = [];

  const overflow = el.scrollWidth - el.clientWidth;
  if (overflow > 0) out.push(['overflow', overflow + 'px horizontal']);

  // Every screen must offer a way onward or back. A screen with no enabled
  // control is a trap, and we shipped three of those.
  const controls = [...document.querySelectorAll('button, input, textarea, a[href]')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (controls.length === 0) out.push(['trapped', 'no enabled interactive element']);

  // Nothing should ever render at zero size or off the left edge.
  for (const n of controls) {
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      out.push(['zero-size', (n.textContent || n.tagName).trim().slice(0, 30)]);
      break;
    }
    if (r.right < 0 || r.left > window.innerWidth) {
      out.push(['offscreen-x', (n.textContent || n.tagName).trim().slice(0, 30)]);
      break;
    }
  }

  // Apple's minimum touch target. A publishable bar, and currently unchecked.
  for (const n of controls) {
    const r = n.getBoundingClientRect();
    if (r.height > 0 && (r.height < 40 || r.width < 40)) {
      out.push(['tap-target', (n.textContent || '').trim().slice(0, 24) + ' ' +
        Math.round(r.width) + 'x' + Math.round(r.height)]);
      break;
    }
  }

  // A stop screen must never name who stopped it. That is a storage and copy
  // guarantee the whole safety layer rests on.
  // Safety stops only. An outcome screen is allowed to name a winner.
  const stopped = document.querySelector('.stopped:not(.stopped--outcome)');
  if (stopped) {
    const names = JSON.parse(localStorage.getItem('lantern.names') || '["",""]');
    for (const nm of names) {
      if (nm && stopped.innerText.includes(nm)) out.push(['attribution', 'stop screen names ' + nm]);
    }
  }

  // Signature of the current screen, used to detect navigation.
  const main = document.querySelector('main');
  const sig = main
    ? (main.className || '') + '|' + (main.innerText || '').slice(0, 60).replace(/\\s+/g, ' ')
    : 'none';

  return { out, sig, scrollY: window.scrollY || 0, controls: controls.length };
}`;

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`monkey: seed=${SEED} steps=${STEPS}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate__input', { timeout: 20000 });
  await page.fill('.gate__input', PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.gate__title', { timeout: 40000 });
  const nameInputs = page.locator('.gate__input');
  await nameInputs.nth(0).fill('Noah');
  await nameInputs.nth(1).fill('Lily');
  await page.click('.btn--primary');
  await page.waitForSelector('.decks', { timeout: 15000 });

  let prev = await page.evaluate(`(${INVARIANTS})()`);
  screensSeen.add(prev.sig.slice(0, 40));

  for (let step = 1; step <= STEPS; step++) {
    // Sometimes scroll first, because a real person is rarely at scroll 0 and
    // that is exactly how the scroll-position bug hid from the scripted audit.
    if (rand() < 0.25) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.floor(rand() * 700));
    }

    const controls = page.locator('button:not([disabled]), textarea, input[type="password"], input:not([type])');
    let count = await controls.count();
    if (count === 0) {
      // Same reasoning as above: wait out any deliberate hold before calling it.
      await page.waitForTimeout(1200);
      count = await controls.count();
      if (count === 0) {
        violation(step, 'trapped', 'no clickable control after waiting');
        break;
      }
    }

    const idx = Math.floor(rand() * count);
    const target = controls.nth(idx);
    let label = '';
    try {
      label = ((await target.innerText().catch(() => '')) || (await target.getAttribute('placeholder')) || '')
        .trim()
        .slice(0, 28);
    } catch {
      label = '?';
    }

    try {
      const tag = await target.evaluate((n) => n.tagName);
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        await target.fill(`monkey ${step}`, { timeout: 3000 });
      } else {
        await target.click({ timeout: 3000 });
      }
    } catch {
      continue; // element went away mid-click; that is fine, keep going
    }

    trail.push(`${step}: ${label || '(unlabelled)'}`);
    await page.waitForTimeout(60);

    let m;
    try {
      m = await page.evaluate(`(${INVARIANTS})()`);
    } catch (err) {
      violation(step, 'crash', String(err).slice(0, 200));
      break;
    }

    // "Trapped" needs a second look. The handoff screen deliberately disables
    // its only control for a moment so the previous answer cannot be glimpsed,
    // and that is a gated state rather than a dead end. Re-check before
    // reporting: permanently stuck is a bug, briefly gated is the design.
    let out = m.out;
    if (out.some(([k]) => k === 'trapped')) {
      await page.waitForTimeout(1200);
      const again = await page.evaluate(`(${INVARIANTS})()`);
      if (!again.out.some(([k]) => k === 'trapped')) {
        out = out.filter(([k]) => k !== 'trapped');
      }
      m = again;
    }

    for (const [kind, detail] of out) violation(step, kind, detail);

    // Navigation must land at the top of the new screen.
    // Forward navigation must land at the top. The game list is exempt: coming
    // BACK to it restores your place, which is correct behaviour rather than
    // carried-over scroll. Asserting scrollY===0 everywhere is what made me
    // break list restoration in the first place.
    const toList = m.sig.startsWith('home');
    if (m.sig !== prev.sig && !toList && m.scrollY !== 0) {
      violation(step, 'scroll-carry', `entered a new screen at scrollY=${m.scrollY}`);
    }

    if (errors.length) {
      for (const e of errors.splice(0)) violation(step, 'js-error', e);
    }

    screensSeen.add(m.sig.slice(0, 40));
    prev = m;
  }

  await page.screenshot({ path: path.join(OUT, 'final.png') });
  await browser.close();

  const byKind = {};
  for (const v of violations) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;

  console.log(`\nvisited ${screensSeen.size} distinct screens over ${STEPS} interactions`);

  if (violations.length === 0) {
    console.log('no invariant violations.');
    return;
  }

  console.error(`\n${violations.length} violation(s):`);
  for (const [k, n] of Object.entries(byKind)) console.error(`  ${k}: ${n}`);

  const shown = new Set();
  for (const v of violations) {
    const key = v.kind + v.detail;
    if (shown.has(key)) continue;
    shown.add(key);
    console.error(`\n  [${v.kind}] step ${v.step}: ${v.detail}`);
    console.error(`    trail: ${v.trail.join(' -> ')}`);
  }

  await writeFile(
    path.join(OUT, `violations-${SEED}.json`),
    JSON.stringify({ seed: SEED, steps: STEPS, violations }, null, 2),
  );
  console.error(`\nreplay with: MONKEY_SEED=${SEED} npm run monkey`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
