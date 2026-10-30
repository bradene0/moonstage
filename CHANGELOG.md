# Changelog

Moonstage is in early development. Contracts may change between releases; each entry lists the contract
versions so you can tell what moved.

## Unreleased

### Added

- **`moonstage guide`**: the docs and agent skills now ship inside the CLI package, so an agent with only
  `npx moonstage` can read them (also an MCP tool, `moonstage_guide`).
- **Saves and prefab checks (behavior ABI 4).** `save_get` / `save_set` (`@sdk.load_save` /
  `@sdk.store_save`) keep numbers across sessions (localStorage in the browser, in memory headless, seedable
  and assertable in tests), and `is_prefab` tells a behavior what kind of entity it collided with. Plugins
  get `ctx.saves`. Moon Hopper keeps a best score.
- **`@moonstage/physics`**, the default physics provider, with its engine written in MoonBit and compiled to
  WebAssembly: rotating circles and boxes, torque, friction, restitution, sensors, distance joints and motorized
  revolute joints, deterministic, about 2 ms per tick for 600 bodies. It ships with the CLI (no install), and
  `pack` / `--single-file` vendor it, along with any other self-contained plugin module, into the game. The
  physics playground uses it.
- **Game templates.** `moonstage new --template platformer` (physics, running, jumping, coins, camera) and
  `--template shooter` (firing, enemies, `is_prefab` collisions, lives, game-over scene, restart), each with
  MoonBit behaviors, tests and a saved best score.
- **Single-file games.** `moonstage build --single-file` writes one self-contained `.html` (runtime modules
  and the game's `.msp` inlined; about 200 KB for Moon Hopper) that plays with no server or network, e.g. as
  an attachment or inside a chat widget. `play()` also accepts `.msp` bytes directly.
- **MoonBit primer** (`moonstage guide moonbit`): the language subset behaviors need, where every snippet
  compiles, plus a table of the compiler errors newcomers hit.
- MoonBit compile errors now carry targeted hints (a `self` parameter, a missing slot name, Int/Double
  mismatches, unused results, assigning to an immutable variable).

- **Plugin drawing (plugin API 4).** Plugins with `draws: true` render the entities that carry their
  extension, through `drawCanvas2d` (browser) and `drawSvg` (headless) hooks; core places the items. The
  conformance suite exercises the hooks. Moon Hopper adds a `radar` drawing plugin.
- **`@moonstage/rive`**, the reference advanced plugin: Rive artboards as entities, state machine inputs
  driven by entity state, triggers by Moonstage events, and Rive-reported events emitted back. It runs
  headless as placeholders.
- Plugin `load(context)` can read project files (`readFile`) and settings (API 4).
- Plugins given as package names resolve from the project directory, and `moonstage build` bundles them
  and their dependencies behind an import map.
- `animation.offset` on sprites: a frame count, or `"auto"` for a stable per-entity offset.
- `npm run bench` (runtime benchmarks at scale) and gzipped size budgets enforced in CI.

- **`moonstage check`** (and the `moonstage_check` MCP tool): validate, compile, run the tests, simulate
  the entry scene and render its last frame in one call, with one report. Skills, templates and `new`
  now point agents at it after every edit.

- **Record and replay.** The browser player records every session; F8 downloads it as a test file that
  replays exactly and expects what happened (final scene, saves, event counts). Play a test back in the
  browser with `moonstage run --replay <file>`, `?replay=` on a built page, or the player's `replay`
  option. `moonstage record` writes any session as an animated SVG that loops in a browser, and `run`,
  `render` and `record` take `--test <file>` to reuse a test's scene, seed, setup, saves and input.
- **Tags and entity queries (behavior ABI 5).** Entities and prefabs take `tags`; behaviors count, visit
  and find the nearest tagged entity (`@sdk.count_tagged`, `nth_tagged`, `nearest_tagged`), and plugins
  list them with `ctx.world.tagged`. ABI 1–4 modules keep working.
- **Tilemaps.** A `tilemap` component draws a grid written as text rows, with tiles as colors or sprite-sheet
  frames. Solid tiles block physics bodies and answer `@sdk.tile_solid(x, y)`; `MS2020` warns about
  characters missing from `tiles`.
- **`moonstage new --template topdown`**: walk a tile maze and collect tagged gems against the clock.

- **Installable agent skills.** Skills are named `moonstage-*` with "Use when…" descriptions.
  `moonstage new` installs them into the project (`.claude/skills/`, `.agents/skills/`; `--no-skills` to
  skip), `moonstage skills install [--global]` installs them anywhere, and the repository is a Claude Code
  plugin marketplace bundling the skills and the MCP server. A new skill section covers record and replay.

### Changed

- **From the first agent eval** (`evals/results/2026-10-30.md`):
  - Physics stacks stay still with default settings: the engine warm-starts its solver, gives box
    contacts per-point depth and puts resting groups of bodies to sleep (untouched 9- and 23-block eval
    towers now move about 1 px in 3 minutes instead of collapsing).
  - Bodies ride kinematic platforms: the provider derived a platform's velocity from its own integrated
    pose, so it read zero every other tick and resting bodies slid off or stayed behind.
  - `MS2018` warns when a behavior on a kinematic body keeps its own data in physics-owned `vx`/`vy`/`av`.
  - `run --headless` and `render` take `--input-script` timelines; event counts are exact on long runs.
  - `moonstage fmt` and `moonstage edit` write compact JSON (scenes about half as long).
  - Single-file games are about half the size (runtime modules gzipped; Moon Hopper 211 → 108 KB).
  - The MoonBit primer has a full `@sdk` table; `guide physics` documents solver settings and state names.
- **From the second agent eval:**
  - Behavior `time()` counts from the start of the current scene, as documented (it kept counting across
    scene switches).
  - Declared state that was never set reads as 0 in tests and `run` output, as it does in behaviors.
  - `run --headless` and `render` take `--setup` (edit operations, like a test's), and both `--setup` and
    `--input-script` accept a test file, so a test can be replayed with its full state shown.
  - `MS2019` warns when physics bodies overlap at scene start.
  - `build --out` is relative to the current directory, like `pack --out` and `render --output`.
  - The MoonBit primer explains reading another entity's state.
- **From the third agent eval:**
  - `moonstage run` live-reloads: it watches the project, rebuilds after a change and reloads open pages.
  - Slightly bouncy blocks stack: only a new contact bounces, so `restitution` no longer feeds jitter
    into resting stacks until they topple (a 4-block column with restitution 0.05 fell within 45 s).
  - `--setup` with a test file also seeds the test's `saves`.
  - `check` no longer repeats validate's stale-slot warnings after regenerating slots.
  - The MoonBit primer covers trig (`@math.sin`, not a method), starting state versus `ms_start`, and
    which entities receive events.
- `ctx.world.setTransform` accepts the scene-file shape (`position: [x, y]`, `scale`) and throws `MS5003` on
  unknown keys or non-finite numbers. Previously `{ position: [...] }` was silently ignored, which broke the
  first game an outside agent built from the repo alone.
- Text bindings and sprite `frameState` no longer warn (`MS2012`) about state on entities that carry data
  for a plugin, since plugins may write that state.
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
