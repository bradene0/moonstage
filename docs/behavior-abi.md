# Behavior ABI (version 3)

A behavior is a WebAssembly module. It controls entities through host functions and sees nothing of the
engine's internals. Only `i32` and `f64` values cross the boundary, so any language that compiles to
WebAssembly can implement a behavior. MoonBit is the first-party language and has an SDK in
`packages/moonbit-sdk`.

ABI 3 is an early contract and may change. The runtime accepts modules that report ABI 1, 2 or 3, because
each version only added imports: ABI 2 added `spawn`, `remove` and `entity_exists`; ABI 3 added
`load_scene` and `play_sound`. A breaking change increments `BEHAVIOR_ABI`
and raises the minimum accepted version.

## Declaring a module

```json
"behaviors": {
  "crystal": {
    "source": "behaviors/crystal",
    "params": ["pickupRadius", "value"],
    "state": ["phase"],
    "refs": ["lander"],
    "inputs": [],
    "events": ["collected"],
    "prefabs": ["sparkle"],
    "sounds": ["chime"],
    "scenes": []
  }
}
```

- Use `source` for a MoonBit package, which `moonstage build` compiles.
- Use `wasm` for a prebuilt module written in any language.

A **slot** is the index of a name in its list. Above, `pickupRadius` is param slot 0, `value` is param
slot 1, and `collected` is event slot 0. MoonBit behaviors never write these numbers by hand: see
[Generated slots](#generated-slots). Entities supply values by name in the scene:

```json
"behavior": { "module": "crystal", "params": { "pickupRadius": 26, "value": 1 }, "refs": { "lander": "lander" } }
```

## Exports (all required)

| Export | Signature | Called |
| --- | --- | --- |
| `ms_abi_version` | `() -> i32` | Once, at load. It must return `1`, `2` or `3`. |
| `ms_start` | `(entity: i32) -> ()` | Once per entity: before the first tick, or at the end of the tick it was spawned in. |
| `ms_update` | `(entity: i32, dt: f64) -> ()` | Every tick, for each active entity. `dt` is in seconds. |
| `ms_event` | `(entity: i32, event: i32, source: i32, value: f64) -> ()` | For each event that the module declares. `event` is the module's slot. `source` is the emitting entity, or `-1`. |

## Imports (namespace `moonstage`)

| Import | Signature | Meaning |
| --- | --- | --- |
| `transform_get` | `(entity: i32, field: i32) -> f64` | Fields: 0 x, 1 y, 2 rotation, 3 scaleX, 4 scaleY. All relative to the parent. |
| `transform_set` | `(entity: i32, field: i32, value: f64)` | |
| `state_get` | `(entity: i32, slot: i32) -> f64` | Named per-entity state. The slot comes from this module's `state` list. Works on any entity. Unset state reads as 0. |
| `state_set` | `(entity: i32, slot: i32, value: f64)` | |
| `param` | `(slot: i32) -> f64` | A parameter of the entity currently being called. Missing params read as 0. |
| `ref` | `(slot: i32) -> i32` | The entity handle for a ref of the current entity, or `-1`. |
| `input` | `(slot: i32) -> f64` | A named input. Axes range from -1 to 1. Buttons are 0 or 1. |
| `emit` | `(event: i32, value: f64)` | Queue an event. The current entity is the source. |
| `random` | `() -> f64` | Seeded uniform value in [0, 1). |
| `time` | `() -> f64` | Simulation seconds since the scene started. |
| `entity_active` | `(entity: i32) -> i32` | 1 if the entity's own `active` flag is set. |
| `entity_set_active` | `(entity: i32, active: i32)` | Inactive entities, and their descendants, are neither updated nor rendered. |
| `log` | `(value: f64)` | Append a value to the runtime log (`moonstage run --json` → `logs`). |
| `spawn` | `(prefab: i32) -> i32` | ABI 2. Spawn prefab `slot` (from this module's `prefabs` list) at the root and return its handle. |
| `remove` | `(entity: i32)` | ABI 2. Remove an entity and its descendants at the end of the tick. |
| `entity_exists` | `(entity: i32) -> i32` | ABI 2. 1 for a live entity; 0 for removed handles and entities marked for removal. |
| `load_scene` | `(scene: i32)` | ABI 3. Switch to scene `slot` (from this module's `scenes` list) at the end of the tick. |
| `play_sound` | `(sound: i32, volume: f64)` | ABI 3. Play sound `slot` (from this module's `sounds` list) at volume 0..1. |

An invalid handle, field or slot makes the host function throw. The runtime reports the throw as `MS3004`
and disables that entity's behavior.

## Spawning and removal

Spawned entities get generated ids (`<prefab>-1`, `<prefab>-2`, …). They exist as soon as `spawn` returns,
so you can position them right away (`@sdk.spawn_at`). Their behaviors run `ms_start` at the end of the
tick and `ms_update` from the next tick on. `remove` takes effect at the end of the tick.

Handles are never reused. A handle kept in state after its entity was removed stays invalid:
`entity_exists` returns 0, and other host functions trap.

## Scenes and sounds

`load_scene` replaces the whole world at the end of the tick. Every entity of the new scene is created fresh
and its behaviors run `ms_start`. Module instances, the random generator and simulation time carry over;
pending events are dropped. Plugins get `stop()` and then `start()`.

`play_sound` does not play anything inside core. It records a request that the platform plays (the browser
player uses Web Audio) and that tests can count. Volume is clamped to 0..1.

## Several behaviors on one entity

`"behavior"` may be a list. The behaviors run in list order and share the entity's state; each keeps its own
params and refs. Use this to compose small reusable behaviors, such as `pulse` plus `crystal` in the
reference project.

## Rules

- **One instance per module.** It is shared by every entity that uses the module. Keep per-entity data in
  `state`, not in module globals.
- **Coordinates.** Pixels, with y growing downward. Rotation is in radians, clockwise, and 0 means
  "pointing up" by convention for sprites with a nose.
- **Determinism.** Use only `random()` and `time()` from the host. Do not read clocks or other
  nondeterministic sources.

## MoonBit

`behaviors/` is a MoonBit module, and each behavior is a package. Its `moon.pkg` imports the SDK and exports
the four functions:

```text
import {
  "moonstage/sdk",
}

options(
  link: { "wasm": { "exports": [ "ms_abi_version", "ms_start", "ms_update", "ms_event" ] } },
)
```

`moonstage build` generates `.moonstage/moon/moon.work`, which joins your module with the SDK. It then runs
`moon build --target wasm --release` and copies each artifact to `.moonstage/behaviors/<name>.wasm`.
You never add the SDK to `moon.mod` by hand, beyond the `import { "moonstage/sdk@0.0.0" }` line that the
template already has.

### Generated slots

`moonstage build` (and `run`, `test` and `render`, which build first) writes a
`slots.generated.mbt` file into each MoonBit behavior package. It contains one constant per declared name,
in snake_case and prefixed by kind:

```moonbit
pub let param_pickup_radius : Int32 = 0
pub let state_phase : Int32 = 0
pub let ref_lander : Int32 = 0
pub let event_collected : Int32 = 0
pub let prefab_sparkle : Int32 = 0
pub let sound_chime : Int32 = 0
```

Use these names in behaviors, as in `@sdk.param(param_pickup_radius)`. Reordering or renaming entries in
`moonstage.json` then either keeps working or fails to compile. It never silently reads the wrong slot.
Commit the generated file so editors and `moon check` work before the first build. `moonstage validate`
warns with `MS3008` when the file is stale. Names that collide after conversion (`minX` and `min_x`)
are rejected with `MS2013`.

The SDK wraps each import (`@sdk.x`, `@sdk.set_position`, `@sdk.state`, `@sdk.param`, `@sdk.ref_entity`,
`@sdk.input`, `@sdk.emit`, `@sdk.random_range`, `@sdk.spawn_at`, `@sdk.remove`, `@sdk.exists`, `@sdk.load_scene`, `@sdk.play_sound`, …). See `packages/moonbit-sdk/sdk.mbt`.

Note that `self` is reserved in MoonBit, so name the first parameter `entity`.
