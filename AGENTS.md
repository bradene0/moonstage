# AGENTS.md

Moonstage is a small, browser-first runtime for games and interactive media. Projects are plain JSON
plus MoonBit behaviors compiled to WebAssembly. It is in early development, and contracts may change.

## Repository map

```text
packages/core/         @moonstage/core: project model, schemas, validation, world, behavior host, plugin host, frames, test runner
packages/player/       @moonstage/player: browser player (Canvas 2D, keyboard, <moonstage-player>)
packages/cli/          moonstage CLI; templates/ holds `moonstage new` templates
packages/moonbit-sdk/  MoonBit bindings for the behavior ABI (module moonstage/sdk)
schemas/               generated JSON Schemas (source of truth: packages/core/src/schema/schemas.ts)
examples/moon-hopper/  reference project and conformance fixture
skills/                task procedures for agents: start with the one that matches your task
docs/                  project format, behavior ABI, plugins, CLI, open decisions
```

## Commands

```bash
npm install
npm run build        # tsc -b for all packages
npm test             # build, then run every *.test.ts (core unit tests, CLI end-to-end, invariants)
npm run schemas      # regenerate schemas/ after changing packages/core/src/schema/schemas.ts
npm run size         # size report
node packages/cli/dist/main.js <command> --json   # the CLI from source
```

The CLI end-to-end tests need the MoonBit toolchain (`moon` on PATH or in `~/.moon/bin`). Without it,
those tests are skipped. CI sets `MOONSTAGE_REQUIRE_MOON=1`, which turns a missing `moon` into a failure.

## Invariants (enforced by packages/cli/src/invariants.test.ts where possible)

1. `core` has zero dependencies and never imports Node, DOM, React, or a renderer, physics or 3D engine.
2. Dependency direction is `core` ← `player` ← `cli`. Plugins depend only on `@moonstage/core` types.
3. Third-party integrations are plugins. Project files use Moonstage vocabulary (`shape`, `behavior`).
   Implementation types (`THREE.Mesh`, Rapier bodies) never appear in them. Plugin data lives under
   `extensions.<pluginName>`.
4. Project files are the source of truth. They must stay editable without a GUI and must stay schema-validatable.
5. Behaviors talk to the runtime only through the behavior ABI (numbers only, the `moonstage` import
   namespace). Any WebAssembly language must remain possible.
6. Headless operation must keep working: simulation and tests never need a renderer.
7. Every reported problem is a `Diagnostic` with a stable code from `DIAGNOSTIC_CODES`. Never reuse a code.
8. Format, plugin API, behavior ABI and package versions are independent (`packages/core/src/versions.ts`).
9. Do not describe Moonstage as "v1", "1.0" or production-ready. Do not add Flash/SWF compatibility.

## Where things live

- Schemas and component vocabulary: `packages/core/src/schema/schemas.ts`. Run `npm run schemas` after editing it.
- Semantic validation: `packages/core/src/project.ts`.
- Behavior ABI host: `packages/core/src/behavior.ts` and `runtime.ts` (`hostFunctions`). Docs: `docs/behavior-abi.md`.
- Plugin API: `packages/core/src/plugin.ts`. Docs: `docs/plugins.md`.
- Shared mutation model (`set_property`, `add_entity`, `remove_entity`): `packages/core/src/operations.ts`.
- CLI commands: `packages/cli/src/commands.ts`. Each returns a structured `CommandResult`.

## Changing things safely

- New component or field: update `schemas.ts` and the TypeScript types in `project.ts`, then the renderers
  (`core/render.ts`, `player/canvas-renderer.ts`, `cli/svg.ts`). Also update `docs/project-format.md`
  and run `npm run schemas`.
- New host function: add it to `HostFunctions` and `HOST_FUNCTIONS`, implement it in
  `runtime.ts`, bind it in `packages/moonbit-sdk/sdk.mbt`, and document it in `docs/behavior-abi.md`.
  A breaking change bumps `BEHAVIOR_ABI`.
- New diagnostic: add it to `DIAGNOSTIC_CODES` in the right range.
- Always finish with `npm test`.

## Skills

- `skills/create-project/`
- `skills/build-game/`
- `skills/author-plugin/`
- `skills/debug-project/`
- `skills/test-render/`
