# Contributing

Thanks for helping. Moonstage is in early development, so contracts may still change. Discussion before a large
change is welcome.

## Setup

```bash
npm install
npm test
```

You need Node.js 22 or newer. Install [MoonBit](https://www.moonbitlang.com/download) to run the end-to-end
tests that compile behaviors. Without it, those tests are skipped locally.

## Where does my change belong?

| Change | Place |
| --- | --- |
| Something every project needs (entities, transforms, events, input, timing) | `packages/core` |
| A specific renderer, physics engine, file format or media runtime | A plugin. Not core. |
| Browser glue (canvas, keyboard, element) | `packages/player` |
| A command or terminal UX | `packages/cli` |
| MoonBit ergonomics | `packages/moonbit-sdk` |

If you are unsure, open an issue. "Can this be a plugin?" is the first question for any new feature.

## Rules of thumb

- Keep `core` dependency-free. `packages/cli/src/invariants.test.ts` checks this.
- Prefer small explicit functions over class hierarchies and indirection.
- Every user-facing problem is a `Diagnostic` with a stable code. Add new codes to `DIAGNOSTIC_CODES`.
- Every CLI command must work with `--json`, and agents must never need to parse prose.
- Tests sit at package boundaries. Core uses `node:test` with JS behavior factories. The CLI runs the real
  binary against `examples/` and generated projects.
- Examples double as fixtures. If you change the reference project, keep its tests meaningful.

## Fixtures

The easiest fixture is a scene plus a `tests/*.test.json` file in an example project. To test core logic
without MoonBit, build behaviors from JS with `jsBehavior()` from
`packages/core/src/test-helpers.test.ts`.

## Performance and size

```bash
npm run bench        # ms per tick and per frame build at 5,000 entities, events, spawning, physics
npm run size         # raw and gzipped package sizes against their budgets
```

CI publishes both tables in the run summary and fails if a package exceeds its gzipped budget
(`scripts/size-report.mjs`). Raise a budget only deliberately, in the change that needs it.

## Packaging

```bash
npm run pack         # build, then write tarballs for all three packages to .release/
npm run smoke:pack   # pack, install the tarballs into a temp dir, run new/validate/test/build there
```

`npm pack` in `packages/cli` copies `packages/moonbit-sdk` into the package (`prepack`) and removes the
copy afterwards (`postpack`). CI runs the smoke test on every push.

## Publishing

The project owner publishes releases; 0.1.0 is the first. For a new release:

1. Make sure you have publish rights in the `moonstage` npm organization.
2. Set the versions in all three `package.json` files, including `@moonstage/core` / `@moonstage/player`
   dependency ranges. Keep the MoonBit SDK version in `packages/moonbit-sdk/moon.mod` in sync with the
   template's `moonstage/sdk@…` import.
3. Add the release to `CHANGELOG.md`.
4. `npm run smoke:pack`, then publish in dependency order: `npm publish -w packages/core`,
   `-w packages/player`, `-w packages/cli`. Each publish asks for two-factor authentication.

The version policy and release automation are open decisions; see `docs/decisions.md`.
