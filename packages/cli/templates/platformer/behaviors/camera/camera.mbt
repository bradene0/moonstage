// Camera: follows its target horizontally, smoothly.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int32) -> Unit {
  ()
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  let target = @sdk.ref_entity(ref_target)
  if !@sdk.exists(target) {
    return
  }
  let k = @sdk.clamp(@sdk.param(param_follow) * dt, 0.0, 1.0)
  let goal = @sdk.clamp(@sdk.x(target), @sdk.param(param_min_x), @sdk.param(param_max_x))
  @sdk.set_x(entity, @sdk.x(entity) + (goal - @sdk.x(entity)) * k)
}

///|
pub fn ms_event(
  _entity : Int32,
  _event : Int32,
  _source : Int32,
  _value : Double,
) -> Unit {
  ()
}
