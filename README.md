# Lantern

A small static web app for two people sharing one phone. No backend, no
accounts, no analytics, no third-party requests. All state lives in
`localStorage` on the device.

## Commands

```
npm install
npm run dev          # --host, so a phone on the same wifi can open it
npm run verify       # THE gate: everything, headless then browser
npm run publish      # verify, seal, commit, push, confirm live  <- after ANY change
```

Individual gates, if you want to run one on its own:

```
npm run typecheck
npm run test         # unit, 42
npm run lint:decks   # content rules over every string in every deck
npm run mutate       # proves each gate can actually fail
npm run budget       # bundle size ceiling
npm run audit        # 47 scripted interaction assertions
npm run monkey       # random interaction, continuous invariants
npm run scenarios    # 26 checks against pre-seeded, dirty storage
npm run soak         # 100 turns, catches slow divergence
npm run a11y         # axe, WCAG 2.1 AA, across 7 screens
```

## How the gates are split, and why

`npm run verify` runs two halves.

**Headless** (typecheck, unit, content lint, mutation, build, size budget) needs
no browser, no content and no secrets, so it runs in CI on every push.

**Browser** (audit, monkey, scenarios, soak, accessibility) drives the real app
against the real sealed content, which needs the passphrase. That is
deliberately not in CI: putting it in Actions secrets would undo the property
the encryption exists for. So this half gates `npm run publish` instead, which
means nothing reaches the deployed app without passing it.

The split is a consequence of the encryption design, not of laziness.

## Why there is a mutation suite

Twice in this project a gate reported success while enforcing nothing: a content
lint whose rules were all inert, and a unit suite that passed on a draw engine
whose difficulty ladder could never leave its lowest tier. In both cases the
green tick was the problem, because it stopped anyone looking.

`npm run mutate` breaks nine things on purpose and asserts the relevant gate goes
red. A mutation that survives is reported as a failure of the SUITE, not of the
code.

## Publishing content

Source content lives in `decks/*.json`, which is gitignored and never leaves
this machine. Only the encrypted bundle is committed. After changing any deck:

```
npm run publish
```

It prompts for the passphrase, seals, commits, pushes, and then waits until the
live bundle actually matches what it just sealed. A green deploy only says the
job ran; it does not say the right bytes are being served.

## Design notes

**Content ships encrypted.** Source content lives in `decks/*.json`, which is
gitignored and never leaves the author's machine. `npm run seal` encrypts it to
`decks/*.enc`, and only the ciphertext is committed. The passphrase is never
in the repo, never in CI, and never in Actions secrets. The app derives the key
in-browser with PBKDF2 and caches it after first unlock.

This matters because a Pages site is publicly readable at its URL regardless of
anything else, so encryption is what actually keeps content private rather than
repository settings.

**Headless is not the device.** `scripts/shots.mjs` renders at 360, 390 and 768
and asserts zero horizontal overflow, which catches the layout breaks that
eyeballing screenshots misses. It cannot see `env(safe-area-inset-*)`, which
reads 0 headless and is non-zero on a real notched phone, so real-device checks
stay in the loop.

**Content lint.** `scripts/lint-decks.mjs` fails the build on content that
violates the project's own rules, rather than warning. Some rules have no
override; others pass only inside a file that explicitly opts in.
