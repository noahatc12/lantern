#!/usr/bin/env node
/**
 * One command: lint, seal, commit, push, and wait for the deploy.
 *
 * Sealing has to be manual because the passphrase must never live in CI or in
 * the repo. But "manual" was costing four commands that were easy to half-do,
 * and content silently stayed stale on the live site while the code moved on.
 * The passphrase stays out of CI; everything around it stops being your problem.
 *
 *   npm run publish
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
}

function capture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: true });
  return (r.stdout ?? '').trim();
}

function fail(msg) {
  console.error(`\n${msg}`);
  process.exit(1);
}

// 1. The FULL gate, before anything leaves this machine. The browser half of
// the suite cannot run in CI (it needs the passphrase), so this is the gate
// that actually protects the deployed app.
console.log('\n[1/5] running the full gate...');
if (run('npm', ['run', '--silent', 'verify']).status !== 0) {
  fail('Verification failed. Nothing was sealed or pushed.');
}

// 2. Seal. Prompts for the passphrase; never reads it from anywhere persistent.
console.log('\n[2/5] sealing...');
if (run('node', ['scripts/seal.mjs']).status !== 0) {
  fail('Sealing failed. Nothing was committed.');
}

if (!existsSync('public/content.enc')) fail('No bundle was produced. Aborting.');
const size = readFileSync('public/content.enc').length;
console.log(`      bundle is ${(size / 1024).toFixed(1)} kB`);

// 3. Commit, but only if the bundle actually changed.
console.log('\n[3/5] committing...');
const dirty = capture('git', ['status', '--porcelain', 'public/content.enc']);
if (!dirty) {
  console.log('      bundle is unchanged, nothing to commit.');
} else {
  run('git', ['add', 'public/content.enc']);
  if (run('git', ['commit', '-q', '-m', '"seal content"']).status !== 0) {
    fail('Commit failed.');
  }
}

const SITE = 'https://noahatc12.github.io/lantern';

/** The build id currently being served, or null if it cannot be read. */
function liveBuildId() {
  const raw = capture('curl', ['-s', `"${SITE}/version.json?cb=${Date.now()}"`]);
  try {
    return JSON.parse(raw).id ?? null;
  } catch {
    return null;
  }
}

// Taken before the push, because "the deploy landed" means this value changed.
const idBefore = liveBuildId();

// 4. Push whatever is ahead, including code commits.
console.log('\n[4/5] pushing...');
if (run('git', ['push', '-q']).status !== 0) fail('Push failed.');

// 5. Wait for the deploy, and check TWO things.
//
//    The bundle bytes prove the right content is being served. On their own
//    they are not enough: content.enc only changes when a deck changes, so a
//    code-only deploy matched instantly against the PREVIOUS deploy and this
//    script cheerfully said "live and current" while the new code was still
//    building. That is the same class of mistake this script was written to
//    prevent, one level up.
//
//    So also wait for the served build id to CHANGE. It is a timestamp written
//    fresh by every build, so it cannot match by accident and it cannot pass
//    trivially.
console.log('\n[5/5] waiting for the deploy...');
const url = `${SITE}/content.enc`;
let live = 0;
let idNow = idBefore;
let bytesOk = false;
let idOk = false;

for (let i = 0; i < 80; i++) {
  if (!bytesOk) {
    const out = capture('curl', ['-s', `"${url}?cb=${Date.now()}"`, '|', 'wc', '-c']);
    live = Number(out) || 0;
    bytesOk = live === size;
  }
  if (!idOk) {
    idNow = liveBuildId();
    idOk = Boolean(idNow) && idNow !== idBefore;
  }
  if (bytesOk && idOk) break;
  spawnSync('node', ['-e', 'setTimeout(()=>{},3000)'], { timeout: 3200 });
}

if (bytesOk && idOk) {
  console.log(`\nLive and current. ${(size / 1024).toFixed(1)} kB serving at`);
  console.log(`${SITE}/`);
  console.log(`Build ${idNow}`);
  console.log('\nClose the app fully from the switcher before reopening; iOS caches hard.');
} else {
  console.log('\nPushed, but the deploy has not fully landed yet.');
  if (!bytesOk) console.log(`  content.enc is ${live} bytes live, we sealed ${size}`);
  if (!idOk) console.log(`  build id is still ${idNow ?? 'unreadable'}`);
  console.log('Give it a minute and reload, or check the Actions tab.');
}
