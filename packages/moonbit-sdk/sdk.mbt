// MoonBit bindings for Moonstage Behavior ABI 3.
//
// A behavior package imports this SDK and exports four functions:
//
//   pub fn ms_abi_version() -> Int32 { @sdk.abi_version }
//   pub fn ms_start(entity : Int32) -> Unit { ... }
//   pub fn ms_update(entity : Int32, dt : Double) -> Unit { ... }
//   pub fn ms_event(entity : Int32, event : Int32, source : Int32, value : Double) -> Unit { ... }
//
// Entities are integer handles. Params, state, refs, inputs, events and
// prefabs are addressed by "slot": the index of the name in the behavior's
// declaration in moonstage.json. `moonstage build` generates named constants
// for them (slots.generated.mbt). The full contract is in docs/behavior-abi.md.

///|
/// ABI version implemented by this SDK. Return it from `ms_abi_version`.
pub let abi_version : Int32 = 3

///|
/// Handle value meaning "no entity" (e.g. an unset ref).
pub let no_entity : Int32 = -1

///|
fn host_transform_get(entity : Int32, field : Int32) -> Double = "moonstage" "transform_get"

///|
fn host_transform_set(entity : Int32, field : Int32, value : Double) -> Unit = "moonstage" "transform_set"

///|
fn host_state_get(entity : Int32, slot : Int32) -> Double = "moonstage" "state_get"

///|
fn host_state_set(entity : Int32, slot : Int32, value : Double) -> Unit = "moonstage" "state_set"

///|
fn host_param(slot : Int32) -> Double = "moonstage" "param"

///|
fn host_ref(slot : Int32) -> Int32 = "moonstage" "ref"

///|
fn host_input(slot : Int32) -> Double = "moonstage" "input"

///|
fn host_emit(event : Int32, value : Double) -> Unit = "moonstage" "emit"

///|
fn host_random() -> Double = "moonstage" "random"

///|
fn host_time() -> Double = "moonstage" "time"

///|
fn host_entity_active(entity : Int32) -> Int32 = "moonstage" "entity_active"

///|
fn host_entity_set_active(entity : Int32, active : Int32) -> Unit = "moonstage" "entity_set_active"

///|
fn host_log(value : Double) -> Unit = "moonstage" "log"

///|
fn host_spawn(prefab : Int32) -> Int32 = "moonstage" "spawn"

///|
fn host_remove(entity : Int32) -> Unit = "moonstage" "remove"

///|
fn host_entity_exists(entity : Int32) -> Int32 = "moonstage" "entity_exists"

///|
fn host_load_scene(scene : Int32) -> Unit = "moonstage" "load_scene"

///|
fn host_play_sound(sound : Int32, volume : Double) -> Unit = "moonstage" "play_sound"

// Transform fields, in ABI order: x, y, rotation, scale_x, scale_y.
// Positions are pixels (y grows downward), rotation is radians (clockwise),
// all relative to the entity's parent.

///|
pub fn x(entity : Int32) -> Double {
  host_transform_get(entity, 0)
}

///|
pub fn y(entity : Int32) -> Double {
  host_transform_get(entity, 1)
}

///|
pub fn rotation(entity : Int32) -> Double {
  host_transform_get(entity, 2)
}

///|
pub fn scale_x(entity : Int32) -> Double {
  host_transform_get(entity, 3)
}

///|
pub fn scale_y(entity : Int32) -> Double {
  host_transform_get(entity, 4)
}

///|
pub fn set_x(entity : Int32, value : Double) -> Unit {
  host_transform_set(entity, 0, value)
}

///|
pub fn set_y(entity : Int32, value : Double) -> Unit {
  host_transform_set(entity, 1, value)
}

///|
pub fn set_position(entity : Int32, x : Double, y : Double) -> Unit {
  host_transform_set(entity, 0, x)
  host_transform_set(entity, 1, y)
}

///|
pub fn set_rotation(entity : Int32, value : Double) -> Unit {
  host_transform_set(entity, 2, value)
}

///|
pub fn set_scale(entity : Int32, sx : Double, sy : Double) -> Unit {
  host_transform_set(entity, 3, sx)
  host_transform_set(entity, 4, sy)
}

///|
/// Read numeric state `slot` (index in the module's `state` list) of any entity.
pub fn state(entity : Int32, slot : Int32) -> Double {
  host_state_get(entity, slot)
}

///|
pub fn set_state(entity : Int32, slot : Int32, value : Double) -> Unit {
  host_state_set(entity, slot, value)
}

///|
/// Read parameter `slot` of the entity currently being updated.
pub fn param(slot : Int32) -> Double {
  host_param(slot)
}

///|
/// Resolve reference `slot` of the current entity, or `no_entity`.
pub fn ref_entity(slot : Int32) -> Int32 {
  host_ref(slot)
}

///|
/// Read named input `slot`: axes are -1..1, buttons are 0 or 1.
pub fn input(slot : Int32) -> Double {
  host_input(slot)
}

///|
/// Emit event `slot` with a numeric payload. The current entity is the source.
pub fn emit(event : Int32, value : Double) -> Unit {
  host_emit(event, value)
}

///|
/// Seeded random number in [0, 1). Deterministic for a given project seed.
pub fn random() -> Double {
  host_random()
}

///|
/// Random number in [lo, hi).
pub fn random_range(lo : Double, hi : Double) -> Double {
  lo + (hi - lo) * host_random()
}

///|
/// Simulation time in seconds since the scene started.
pub fn time() -> Double {
  host_time()
}

///|
pub fn is_active(entity : Int32) -> Bool {
  host_entity_active(entity) != 0
}

///|
pub fn set_active(entity : Int32, active : Bool) -> Unit {
  host_entity_set_active(entity, if active { 1 } else { 0 })
}

///|
/// Record a number in the runtime log (visible in `moonstage run --json`).
pub fn log(value : Double) -> Unit {
  host_log(value)
}

///|
/// Spawn prefab `slot` (index in the module's `prefabs` list) at the root.
/// The new entity can be positioned right away; its behaviors start at the end
/// of this tick and first update on the next one.
pub fn spawn(prefab : Int32) -> Int32 {
  host_spawn(prefab)
}

///|
/// Spawn a prefab at a position.
pub fn spawn_at(prefab : Int32, x : Double, y : Double) -> Int32 {
  let entity = host_spawn(prefab)
  set_position(entity, x, y)
  entity
}

///|
/// Remove an entity and its descendants at the end of this tick.
pub fn remove(entity : Int32) -> Unit {
  host_remove(entity)
}

///|
/// False for removed handles, entities marked for removal, and `no_entity`.
pub fn exists(entity : Int32) -> Bool {
  entity >= 0 && host_entity_exists(entity) != 0
}

///|
/// Distance between two entities' positions (same parent space assumed).
pub fn distance(a : Int32, b : Int32) -> Double {
  let dx = x(a) - x(b)
  let dy = y(a) - y(b)
  (dx * dx + dy * dy).sqrt()
}

///|
pub fn clamp(value : Double, lo : Double, hi : Double) -> Double {
  if value < lo {
    lo
  } else if value > hi {
    hi
  } else {
    value
  }
}

///|
/// Switch to scene `slot` (index in the module's `scenes` list) at the end of
/// this tick. Every behavior in the new scene starts fresh.
pub fn load_scene(scene : Int32) -> Unit {
  host_load_scene(scene)
}

///|
/// Play sound `slot` (index in the module's `sounds` list) at volume 0..1.
pub fn play_sound(sound : Int32, volume : Double) -> Unit {
  host_play_sound(sound, volume)
}
