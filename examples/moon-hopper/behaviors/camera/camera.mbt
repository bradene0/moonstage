// Camera: smoothly follows its target and shakes when a crystal is collected.

///|
let p_follow : Int = 0

///|
let p_shake : Int = 1

///|
let s_shake : Int = 0

///|
let s_cx : Int = 1

///|
let s_cy : Int = 2

///|
let r_target : Int = 0

///|
pub fn ms_abi_version() -> Int {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int) -> Unit {
  let target = @sdk.ref_entity(r_target)
  if target != @sdk.no_entity {
    @sdk.set_position(entity, @sdk.x(target), @sdk.y(target))
  }
  @sdk.set_state(entity, s_cx, @sdk.x(entity))
  @sdk.set_state(entity, s_cy, @sdk.y(entity))
}

///|
pub fn ms_update(entity : Int, dt : Double) -> Unit {
  let target = @sdk.ref_entity(r_target)
  let mut cx = @sdk.state(entity, s_cx)
  let mut cy = @sdk.state(entity, s_cy)
  if target != @sdk.no_entity {
    let k = @sdk.clamp(@sdk.param(p_follow) * dt, 0.0, 1.0)
    cx = cx + (@sdk.x(target) - cx) * k
    cy = cy + (@sdk.y(target) - cy) * k
  }
  @sdk.set_state(entity, s_cx, cx)
  @sdk.set_state(entity, s_cy, cy)
  let shake = @sdk.state(entity, s_shake)
  let amount = shake * @sdk.param(p_shake)
  @sdk.set_position(
    entity,
    cx + (@sdk.random() - 0.5) * amount,
    cy + (@sdk.random() - 0.5) * amount,
  )
  @sdk.set_state(entity, s_shake, @sdk.clamp(shake - dt * 2.5, 0.0, 1.0))
}

///|
pub fn ms_event(entity : Int, _event : Int, _source : Int, _value : Double) -> Unit {
  @sdk.set_state(entity, s_shake, 1.0)
}
