// Camera: smoothly follows its target and shakes when a crystal is collected.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  let target = @sdk.ref_entity(ref_target)
  if target != @sdk.no_entity {
    @sdk.set_position(entity, @sdk.x(target), @sdk.y(target))
  }
  @sdk.set_state(entity, state_cx, @sdk.x(entity))
  @sdk.set_state(entity, state_cy, @sdk.y(entity))
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  let target = @sdk.ref_entity(ref_target)
  let mut cx = @sdk.state(entity, state_cx)
  let mut cy = @sdk.state(entity, state_cy)
  if target != @sdk.no_entity {
    let k = @sdk.clamp(@sdk.param(param_follow) * dt, 0.0, 1.0)
    cx = cx + (@sdk.x(target) - cx) * k
    cy = cy + (@sdk.y(target) - cy) * k
  }
  @sdk.set_state(entity, state_cx, cx)
  @sdk.set_state(entity, state_cy, cy)
  let shake = @sdk.state(entity, state_shake)
  let amount = shake * @sdk.param(param_shake)
  @sdk.set_position(
    entity,
    cx + (@sdk.random() - 0.5) * amount,
    cy + (@sdk.random() - 0.5) * amount,
  )
  @sdk.set_state(entity, state_shake, @sdk.clamp(shake - dt * 2.5, 0.0, 1.0))
}

///|
pub fn ms_event(
  entity : Int32,
  _event : Int32,
  _source : Int32,
  _value : Double,
) -> Unit {
  @sdk.set_state(entity, state_shake, 1.0)
}
