# Behavior ABI (version 1)

A behavior is a WebAssembly module. It controls entities through host functions and sees nothing of the
engine's internals. Only `i32` and `f64` values cross the boundary, so any language that compiles to
WebAssembly can implement a behavior. MoonBit is the first-party language and has an SDK in
`packages/moonbit-sdk`.

ABI version 1 is an early contract and may change. A breaking change increments `BEHAVIOR_ABI`.

## Declaring a module

```json
"behaviors": {
  "crystal": {
    "source": "behaviors/crystal",
    "params": ["pickupRadius", "value"],
    "state": ["phase"],
    "refs": ["lander"],
    "inputs": [],
    "events": ["collected"]
  }
}
```

- Use `source` for a MoonBit package, which `moonstage build` compiles.
- Use `wasm` for a prebuilt module written in any language.

A **slot** is the index of a name in its list. Above, `pickupRadius` is param slot 0, `value` is param
slot 1, and `collected` is event slot 0. Entities supply values by name in the scene:

```json
"behavior": { "module": "crystal", "params": { "pickupRadius": 26, "value": 1 }, "refs": { "lander": "lander" } }
```

## Exports (all required)

| Export | Signature | Called |
| --- | --- | --- |
| `ms_abi_version` | `() -> i32` | Once, at load. It must return `1`. |
| `ms_start` | `(entity: i32) -> ()` | Once per entity, before the first tick. |
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

An invalid handle, field or slot makes the host function throw. The runtime reports the throw as `MS3004`
and disables that entity's behavior.

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

The SDK wraps each import (`@sdk.x`, `@sdk.set_position`, `@sdk.state`, `@sdk.param`, `@sdk.ref_entity`,
`@sdk.input`, `@sdk.emit`, `@sdk.random_range`, …). See `packages/moonbit-sdk/sdk.mbt`.

Note that `self` is reserved in MoonBit, so name the first parameter `entity`.
