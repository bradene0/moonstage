// Bullet: flies up and removes itself off screen. Enemies detect the hit.

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
  let y = @sdk.y(entity) - @sdk.param(param_speed) * dt
  @sdk.set_y(entity, y)
  if y < -40.0 {
    @sdk.remove(entity)
  }
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
