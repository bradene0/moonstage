# Physics

Moonstage core does not simulate physics. It owns the **vocabulary** (components and settings that describe
intent), and a **physics provider plugin** turns that into motion. Providers are interchangeable: a project
that works with one should work with another, within each provider's documented limits.

## Vocabulary

| Where | Field | Meaning |
| --- | --- | --- |
| `moonstage.json` | `physics.gravity` | [x, y] in pixels per second squared (default [0, 980]). |
| component | `physicsBody` | `type` (`dynamic` default, `static`, `kinematic`), `mass`, `velocity`, `angularVelocity`, `gravityScale`, `linearDamping`, `angularDamping`, `fixedRotation` |
| component | `collider` | `shape` (`circle`, `box`, `polygon`) with `radius` / `size` / `points`, `offset`, `density`, `friction`, `restitution`, `sensor` |
| component | `joint` | `type` (`distance`, `revolute`, `weld`), `target` entity id, `anchor`, `targetAnchor`, `length`, `motorSpeed`, `maxMotorTorque` |

A collider without a `physicsBody` is static. Bodies should be root entities (no `parent`).

`moonstage validate` warns with `MS2016` when a project uses these components but no plugin declares
`provides: ["physics"]`, and errors when a joint's target is missing.

## The provider contract

A provider is a plugin with `provides: ["physics"]` and plugin API 3. Every tick, after behaviors run, it must:

1. **Read changes behaviors made**: a moved transform is a teleport, and changed state `vx`, `vy` or `av`
   is a new velocity. Kinematic bodies follow their transform.
2. **Step the simulation** with `physics.gravity`.
3. **Write back** dynamic bodies' transforms, and state `vx`, `vy` (pixels per second) and `av` (radians
   per second) for dynamic and kinematic bodies.
4. **Emit events**, once per entity in each pair: `collision` when two colliders start touching and
   `collisionEnd` when they stop. The event's source is the entity it is about, and its value is the other
   entity's handle. Sensors report events but get no physical response.
5. **Track spawned and removed entities** (`entityAdded` / `entityRemoved`).

Behaviors therefore control bodies through state they already understand:

```moonbit
// in a behavior whose module declares state ["vx", "vy"] and events ["collision"]
@sdk.set_state(entity, state_vx, @sdk.input(input_move) * @sdk.param(param_speed))
```

```moonbit
pub fn ms_event(entity : Int32, event : Int32, source : Int32, value : Double) -> Unit {
  if event == event_collision && source == entity {
    let other = value.to_int() // handle of what we hit
    ...
  }
}
```

## Providers

- **`arcade-physics`** (`examples/physics-playground/plugins/arcade-physics.js`) is the reference provider.
  It has no dependencies and is about 350 lines. It supports circles and axis-aligned boxes (polygons
  collide as their bounding box), restitution, friction, sensors, collision events, distance joints, and
  pin-style revolute and weld joints. It applies no torque from collisions, and broad-phase is O(n²).
  Copy it into a project for arcade games.
- A provider built on a full engine (for example Rapier) can implement the same contract for rotating
  polygons, real joints and large scenes. It would use `load()` (plugin API 3) to initialize the engine's
  WebAssembly. Moonstage does not ship one; see `docs/decisions.md`.

Check any provider with `moonstage plugin check`. Test physics behavior with project tests, as
`examples/physics-playground/tests/` does.
