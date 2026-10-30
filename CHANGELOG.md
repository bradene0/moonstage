# Changelog

Moonstage is in early development. Contracts may change between releases; each entry lists the contract
versions so you can tell what moved.

## Unreleased

### Added

- `animation.offset` on sprites: a frame count, or `"auto"` for a stable per-entity offset.
- `npm run bench` (runtime benchmarks at scale) and gzipped size budgets enforced in CI.

### Changed

- Faster event dispatch (an index of listeners instead of scanning every entity: 19.7 → 6.8 ms per tick in
  the 100,000-call benchmark), allocation-free behavior calls and transform snapshots, cached ancestor matrices.
- The reference physics provider uses a uniform-grid broad phase (600 bodies: 8.3 → 5.0 ms per tick).
- CI pins the MoonBit toolchain (`0.10.18+6c83a7f62`) and runs a non-blocking job against the latest one.
- Moon Hopper's crystals no longer animate in lockstep.

## 0.3.0

Contract versions: project format 1, behavior ABI 3 (accepts 1-3), plugin API 3 (accepts 1-3), package format 1.

Existing projects, compiled behaviors and plugins keep working unchanged.

### Added

- **Semantic editing and MCP.** `moonstage edit` applies operations to a scene and validates the whole project
  before writing (`--dry-run` to check only). New operations: `unset_property`, `attach_behavior`,
  `detach_behavior`. `moonstage scene` prints a scene. `moonstage mcp` serves twelve tools over the Model
  Context Protocol (stdio) as a thin layer over the CLI functions.
- **Physics contract.** `physicsBody`, `collider` and `joint` components and `physics.gravity`, simulated by a
  provider plugin (`provides: ["physics"]`). Behaviors drive bodies through state `vx` / `vy` / `av`, and
  providers emit `collision` / `collisionEnd`. See `docs/physics.md`. `examples/physics-playground` ships a
  dependency-free reference provider.
- **Plugin API 3.** Async `load()`, `provides`, `world.component` / `handle` / `parent`, `ctx.project`,
  `ctx.scene`, `world.loadScene`, an `audio` capability and events with a source entity.
- **Scenes and sound (behavior ABI 3).** `load_scene` and `play_sound`, declared through module `scenes` and
  `sounds` lists. Core records sound requests; the browser player plays them with Web Audio. Tests can assert
  `{ "scene": … }` and `{ "sound": …, "count": … }`.
- **Packages.** `moonstage pack` / `unpack` and `.msp` support in the player and in `validate`, `inspect`,
  `scene`, `run --headless` and `render`.
- New diagnostics: `MS1005` (invalid package), `MS2016` (invalid physics setup), `MS2017` (invalid sound).

### Changed

- Button presses latch until the end of the next tick, so taps shorter than a tick are no longer lost.
- Schema errors in operations now point at the matching operation type.
- Moon Hopper has a title scene and a pickup sound.

## 0.2.0

Contract versions: project format 1, behavior ABI 2 (accepts 1), plugin API 2 (accepts 1).

Existing 0.1.0 projects, compiled behaviors and plugins keep working unchanged.

### Added

- **Prefabs, spawning and removal.** `prefabs` in `moonstage.json` declares entity templates. Behaviors spawn
  them with `@sdk.spawn` / `@sdk.spawn_at` and remove entities with `@sdk.remove` (behavior ABI 2:
  `spawn`, `remove`, `entity_exists`). Spawned entities get ids like `sparkle-3`. Removal takes descendants
  with it, and handles are never reused.
- **Several behaviors per entity.** `"behavior"` can be a list; entries run in order and share the entity's
  state.
- **Sprites and image assets.** Assets can describe sprite sheets and pixel-art scaling. The new `sprite`
  component draws a fixed frame, a frame driven by state, or an animation timed on simulation time. Supported
  by the browser player and by `moonstage render`, whose SVG embeds the images.
- **Plugin tooling.** `moonstage plugin new` scaffolds a plugin package. `moonstage plugin check` and
  `checkPluginConformance()` verify a plugin against the contract (definition, schemas, capabilities,
  lifecycle with spawned and removed entities, reload).
- **Plugin API 2.** `ctx.world.spawn` / `remove`, `entityAdded` / `entityRemoved` hooks, and seeded
  `ctx.random()`.
- **Generated slot constants.** `moonstage build` writes `slots.generated.mbt` with names such as
  `param_speed` and `prefab_sparkle`, so behaviors never hard-code slot numbers. `validate` warns when the
  file is stale (`MS3008`).
- Tests can assert on live prefab counts: `{ "prefab": "sparkle", "count": { "equals": 8 } }`.
- New diagnostics: `MS2013` (slot name collision), `MS2014` (unknown prefab), `MS2015` (invalid sprite asset),
  `MS3008` (stale generated slots), `MS4006` (plugin conformance failure).

### Changed

- `moonstage inspect --json` reports `behaviors` (a list of module names) per entity instead of `behavior`,
  and lists prefabs.
- Schema errors inside a list of behaviors now point at the offending entry.
- The reference project, Moon Hopper, now uses composed behaviors, a sparkle prefab and an animated
  sprite-sheet crystal.

## 0.1.0

First public release: the project format with JSON Schemas, the dependency-free core runtime, the MoonBit
behavior ABI and SDK, the plugin contract, the browser player, the CLI (`describe`, `new`, `validate`,
`inspect`, `build`, `run`, `test`, `render`, `schemas`) and the Moon Hopper reference project.
