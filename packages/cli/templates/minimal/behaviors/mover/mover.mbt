// param_* and input_* come from slots.generated.mbt, which `moonstage build`
// regenerates from the "mover" entry in moonstage.json.

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
  let speed = @sdk.param(param_speed)
  let x = @sdk.x(entity) + @sdk.input(input_move_x) * speed * dt
  let y = @sdk.y(entity) + @sdk.input(input_move_y) * speed * dt
  @sdk.set_position(
    entity,
    @sdk.clamp(x, @sdk.param(param_min_x), @sdk.param(param_max_x)),
    @sdk.clamp(y, @sdk.param(param_min_y), @sdk.param(param_max_y)),
  )
}

///|
pub fn ms_event(_entity : Int32, _event : Int32, _source : Int32, _value : Double) -> Unit {
  ()
}
