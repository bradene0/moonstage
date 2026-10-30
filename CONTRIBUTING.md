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

## Publishing (not set up yet)

Publishing the CLI needs `packages/moonbit-sdk` copied into `packages/cli/moonbit-sdk`. The CLI already
looks there first. Release automation is an open decision; see `docs/decisions.md`.
