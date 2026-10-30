// Cart: a dynamic physics body driven through the physics state contract.
// Writing state vx / vy sets the body's velocity; the provider writes them back each tick.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int32) -> Unit {
  ()
}

///|
pub fn ms_update(entity : Int32, _dt : Double) -> Unit {
  @sdk.set_state(entity, state_vx, @sdk.input(input_move) * @sdk.param(param_speed))
  // Jump only when roughly at rest vertically (standing on something).
  let vy = @sdk.state(entity, state_vy)
  if @sdk.input(input_jump) > 0.5 && vy > -1.0 && vy < 1.0 {
    @sdk.set_state(entity, state_vy, -@sdk.param(param_jump))
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
