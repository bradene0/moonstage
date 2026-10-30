# Architecture

This document is for contributors who change core contracts. Project authors do not need it.

## Shape of the system

```text
             ┌───────────── project folder (source of truth) ─────────────┐
             │ moonstage.json · scenes/*.scene.json · behaviors/ · tests/ │
             └──────────────────────────────┬─────────────────────────────┘
                                            │ ProjectIO (fs or fetch)
                                            ▼
┌─────────────────────────────── @moonstage/core ───────────────────────────────┐
│ loader ─► schema + semantic validation ─► LoadedProject                       │
│                                               │                               │
│                                               ▼                               │
│  Runtime ── World (entities, hierarchy, transforms, state)                    │
│     │      ├─ behavior host ◄─► WebAssembly modules (Behavior ABI)            │
│     │      ├─ plugin host   ◄─► plugins (capability-gated context)            │
│     │      ├─ events, input, seeded random, fixed-step clock                  │
│     │      └─ buildFrame() ─► RenderFrame (flat, sorted draw items)           │
│  operations (semantic edits) · runTest (headless tests)                       │
└──────────────┬────────────────────────────────────────────┬───────────────────┘
               │                                            │
     @moonstage/player (browser)                   moonstage CLI (Node)
     Canvas 2D renderer, keyboard,                 validate · inspect · build · run
     <moonstage-player>                            test · render (SVG) · new · describe
```

`core` has no I/O. Loaders take a `ProjectIO` (read text, read bytes, import a module). The CLI provides
one backed by the filesystem. The player provides one backed by `fetch`. Because of this, both load and
validate projects in exactly the same way.

## Source model and runtime model

The JSON files are an authoring contract. They are not a memory layout. `World` compiles a scene into
entity records with integer handles. Handles exist only inside one runtime. Authors, tests and tools always
use stable string ids. Behaviors receive handles, because only numbers cross the WebAssembly boundary.

## Simulation loop

The simulation advances at a fixed rate, `simulation.tickRate` (default 60 Hz). Each tick runs these steps
in order:

1. Copy the current transforms to `previous`. Rendering interpolates between the two.
2. Call `ms_update(entity, dt)` for every active entity with a behavior, in scene order.
3. Call `update(dt)` for every plugin, in manifest order.
4. Dispatch queued events: first to behaviors whose module declares the event, then to plugin listeners.
   Events raised during dispatch go to the next round, up to 8 rounds per tick.
5. Settle the lifecycle: run `ms_start` and plugin `entityAdded` for entities spawned during the tick, then
   remove entities marked for removal (plugin `entityRemoved`).

A scene switch (`load_scene`, or a plugin's `ctx.world.loadScene`) also happens at step 5. The world is rebuilt
from the new scene's source, behaviors start fresh, and plugins are stopped and started; module instances,
the random generator and simulation time carry over.

Core never plays audio. `play_sound` records a request (`Runtime.sounds`, `drainSounds()`), and the platform plays it.
Button presses latch until the end of the next tick, so taps shorter than a tick are not lost.

Spawned entities exist immediately, so the spawner can position them, but they are only started at step 5
and first updated on the next tick. Entity handles are never reused, so a stale handle can never reach a
different entity.

`advance(seconds)` runs as many whole ticks as fit into the elapsed time, at most 5 per call, and returns
the interpolation factor. Simulation time (`tick × dt`) is separate from wall-clock time. All
randomness comes from a seeded mulberry32 generator. Given the same seed and the same input, a run is
reproducible. Tests check this. Bit-identical results across browsers are not a goal yet.

## Behaviors

A behavior module is one WebAssembly instance, shared by every entity that uses it. Per-entity data lives in
host-side named state (`state_get` / `state_set`), not in WebAssembly globals. This has three benefits:

- Memory stays flat as the number of entities grows. One instance costs at least one memory page.
- State can be inspected by `moonstage run --json`, by tests and by text bindings.
- Any language works: the ABI passes only i32 and f64 values.

Names never cross the ABI. A module declares `params`, `state`, `refs`, `inputs` and `events` in the
manifest, and the slot is the index of a name in its list. For MoonBit, the CLI generates named slot
constants from the manifest, so behavior code never contains bare indices. See [docs/behavior-abi.md](docs/behavior-abi.md).

A trap in one behavior call becomes a `MS3004` diagnostic, and only that entity's binding is disabled.
The rest of the scene keeps running.

## Plugins

A plugin is a plain object with metadata, a declared plugin API level, declared capabilities and a
`create(context, config)` function. The context exposes only the declared capabilities. Calling anything
else throws `MS4003`. Plugins can validate their own config and their entity extension data with JSON
Schemas that core checks before the plugin is created. `checkPluginConformance` in core (exposed as
`moonstage plugin check`) runs a plugin through a synthetic project to verify the contract. See
[docs/plugins.md](docs/plugins.md).

Renderers follow the same separation. Core produces a `RenderFrame` in which every item already has a resolved
screen-space matrix. A renderer never reads the world. The Canvas 2D renderer (player) and the SVG
renderer (CLI) are about 100 lines each. A WebGL, WebGPU or Rive renderer would implement the same
`Renderer` interface.

## Validation layers

1. JSON Schema (subset validator in `core/schema/validate.ts`). It produces `MS1xxx` codes with instance paths.
2. Semantic checks across files (`core/project.ts`). They produce `MS2xxx` codes with file, path and entity.
3. Load-time checks: behaviors built and ABI-compatible (`MS3xxx`), plugins loadable and compatible (`MS4xxx`).

The schemas in `core/src/schema/schemas.ts` are canonical. `schemas/*.json` is generated from them, and a
test keeps the two in sync. Ajv checks that the generated schemas are standard JSON Schema.

## Semantic operations

`applyOperation(scene, op)` is the one mutation model. Test `setup`, `moonstage edit` and the MCP server
(`moonstage mcp`, a thin adapter over the CLI command functions) all use it. A future visual editor should
too.

## Known limits (deliberate, for now)

- Built-in renderables are shapes, text and image sprites (with sprite sheets). There is no tinting,
  nine-slice or texture atlas packing yet.
- Audio is fire-and-forget sound effects; there is no music streaming, mixing or spatial audio yet.
- Physics is a provider plugin boundary ([docs/physics.md](docs/physics.md)). The only provider shipped is a
  small reference one in `examples/physics-playground`.
- Plugins in the browser bundle must be project-local files. Bare package specifiers need an import map.
- `.msp` packages (`moonstage pack`) are not implemented. `dist/` is a plain static folder.
