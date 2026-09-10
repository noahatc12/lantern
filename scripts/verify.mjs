#!/usr/bin/env node
/**
 * The full gate. Everything, in one command, in the order that fails cheapest
 * first.
 *
 * Split deliberately into two halves:
 *
 *   HEADLESS   typecheck, unit, content lint, mutation, build, size budget.
 *              No browser, no content, no secrets. This half runs in CI.
 *
 *   BROWSER    audit, monkey, scenarios, soak, accessibility. These drive the
 *              real app against the real sealed bundle, which needs the
 *              passphrase. That does not go in CI, so this half runs here and
 *              gates every publish instead.
 *
 * The split is a consequence of the encryption design rather than laziness: CI
 * genuinely cannot unlock the content, and giving it the ability to would undo
 * the property the whole thing exists for.
 *
 *   npm run verify
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';

const PORT = Number(process.env.VERIFY_PORT ?? 4290);
const BASE = `http://localhost:${PORT}/lantern/`;

let failed = 0;

function step(label, cmd, env = {}) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${label}`);
  }
  return r.status === 0;
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Kill the preview server, and mean it.
 *
 * `spawn` with a shell starts a shell that starts npx that starts node, and
 * `child.kill()` on Windows kills only the shell. The node process keeps the
 * port, the next verify refuses to start because something is already serving
 * it, and a full gate run is burned finding that out. Killing the tree is the
 * only thing that actually works here.
 */
function stopServer(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill();
    }
  }
}

async function main() {
  // ---- headless half -------------------------------------------------------
  step('typecheck', 'npm run --silent typecheck');
  step('unit tests', 'npm run --silent test');
  step('content lint', 'npm run --silent lint:decks');
  step('content audit', 'npm run --silent audit:content');
  step('mutation suite', 'npm run --silent mutate');
  step('build', 'npm run --silent build');
  step('bundle budget', 'node scripts/budget.mjs');

  if (failed > 0) {
    console.error(`\n${failed} headless gate(s) failed. Not starting the browser half.`);
    process.exit(1);
  }

  // ---- browser half --------------------------------------------------------
  if (!existsSync('.passphrase.local')) {
    console.log('\nNo .passphrase.local, skipping the browser half.');
    console.log('That half needs the real sealed content, so it cannot run unattended.');
    process.exit(0);
  }

  // Refuse to start on a port something is already serving.
  //
  // Two overlapping verify runs share this port, one server wins, and when the
  // loser is cleaned up it takes the survivor's server with it. The browser half
  // then reports the app as broken when the only broken thing is the harness.
  // That already cost a debugging session, so it fails loudly now.
  try {
    const probe = await fetch(BASE);
    if (probe.ok) {
      console.error(`
Something is already serving ${BASE}.`);
      console.error('Another verify or preview is running. Stop it and try again.');
      process.exit(1);
    }
  } catch {
    // Nothing there, which is what we want.
  }

  // Serve the freshly built app with the real bundle beside it.
  copyFileSync('public/content.enc', 'dist/content.enc');

  // Single command string: with shell:true, an argv array is concatenated
  // rather than escaped, which on Windows silently produced a server that
  // never started.
  const server = spawn(`npx vite preview --port ${PORT}`, {
    shell: true,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });

  // The finally below only runs on a normal exit. Interrupting a run left the
  // server holding the port, which is the state that then blocks the next one.
  const bail = () => {
    stopServer(server);
    process.exit(130);
  };
  process.on('SIGINT', bail);
  process.on('SIGTERM', bail);

  try {
    if (!(await waitForServer(BASE))) {
      console.error('preview server never came up');
      process.exit(1);
    }

    const env = {
      WALK_BASE: BASE,
      MONKEY_BASE: BASE,
      SCEN_BASE: BASE,
      SOAK_BASE: BASE,
      A11Y_BASE: BASE,
    };

    step('interaction audit', 'node scripts/walkthrough.mjs', env);
    step('dirty-state scenarios', 'node scripts/scenarios.mjs', env);
    step('soak', 'node scripts/soak.mjs', env);
    step('accessibility', 'node scripts/a11y.mjs', env);
    // Several seeds: a single random walk is one sample, not coverage.
    for (const seed of [1, 7, 42]) {
      step(`monkey (seed ${seed})`, 'node scripts/monkey.mjs', {
        ...env,
        MONKEY_SEED: String(seed),
        MONKEY_STEPS: '200',
      });
    }
  } finally {
    stopServer(server);
    try {
      unlinkSync('dist/content.enc');
    } catch {
      /* already gone */
    }
  }

  console.log('');
  if (failed > 0) {
    console.error(`${failed} gate(s) failed.`);
    process.exit(1);
  }
  console.log('everything green.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
