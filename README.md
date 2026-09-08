# Lantern

A small static web app for two people sharing one phone. No backend, no
accounts, no analytics, no third-party requests. All state lives in
`localStorage` on the device.

## Commands

```
npm install
npm run dev          # --host, so a phone on the same wifi can open it
npm run build
npm run preview      # serves dist at :4173
npm run check        # typecheck + tests + content lint
npm run audit        # drives the real app end to end, 44 interaction assertions
npm run publish      # lint, seal, commit, push, verify live  <- after ANY content change
```

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
