# Changelog

Moonstage is in early development. Contracts may change between releases; each entry lists the contract
versions so you can tell what moved.

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
