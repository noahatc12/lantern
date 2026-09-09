#!/usr/bin/env node
/**
 * Bundle size budget.
 *
 * The number is not the point. The point is that it should not stop being fine
 * quietly: a dependency added for one convenience is how a phone app becomes
 * slow to open in a room with bad wifi, and nobody notices the day it happens.
 *
 * Raised 260 to 330 kB on 2026-09-08, deliberately, for six new engines and
 * thirteen new games. That is roughly 3 kB of shipped code per game, which is
 * the right shape: the growth is content and screens rather than dependencies,
 * and the dependency list is still React and nothing else. If this ever needs
 * raising again for a reason that is NOT "we added games", that is the signal
 * something was pulled in that should not have been.
 *
 * The real constraint is one cold load on a phone, once, after which it is
 * cached. That is what makes this number generous rather than lax.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BUDGETS = { js: 330 * 1024, css: 60 * 1024 };

const dir = path.resolve('dist', 'assets');
let js = 0;
let css = 0;

for (const f of readdirSync(dir)) {
  const size = statSync(path.join(dir, f)).size;
  if (f.endsWith('.js')) js += size;
  if (f.endsWith('.css')) css += size;
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const over = [];
if (js > BUDGETS.js) over.push(`js ${kb(js)} over ${kb(BUDGETS.js)}`);
if (css > BUDGETS.css) over.push(`css ${kb(css)} over ${kb(BUDGETS.css)}`);

console.log(`bundle: js ${kb(js)} / ${kb(BUDGETS.js)}, css ${kb(css)} / ${kb(BUDGETS.css)}`);

if (over.length) {
  console.error(`\nOVER BUDGET: ${over.join('; ')}`);
  console.error('Raise the budget deliberately, or work out what got added.');
  process.exit(1);
}
