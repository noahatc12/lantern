#!/usr/bin/env node
/**
 * Bundle size budget.
 *
 * 195KB is fine. The point is that it should not stop being fine quietly. A
 * dependency added for one convenience is how a phone app becomes slow to open
 * in a room with bad wifi, and nobody notices the day it happens.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BUDGETS = { js: 260 * 1024, css: 40 * 1024 };

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
