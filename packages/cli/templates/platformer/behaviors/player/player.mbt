// Player: runs with the move axis and jumps with the jump button. The body is
// simulated by @moonstage/physics; this behavior steers it through the
// physics velocity state (vx, vy) and respawns it after a fall.

///|
fn approach(value : Double, target : Double, step : Double) -> Double {
  if value < target {
    @sdk.clamp(value + step, value, target)
  } else {
    @sdk.clamp(value - step, target, value)
  }
}

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
  let target = @sdk.input(input_move) * @sdk.param(param_speed)
  let vx = approach(@sdk.state(entity, state_vx), target, @sdk.param(param_accel) * dt)
  @sdk.set_state(entity, state_vx, vx)
  // Standing on something means no vertical speed; a simple, good-enough ground check.
  let vy = @sdk.state(entity, state_vy)
  if @sdk.input(input_jump) > 0.5 && vy.abs() < 1.0 {
    @sdk.set_state(entity, state_vy, -@sdk.param(param_jump))
  }
  if @sdk.y(entity) > @sdk.param(param_fall_y) {
    @sdk.set_position(entity, @sdk.param(param_spawn_x), @sdk.param(param_spawn_y))
    @sdk.set_state(entity, state_vx, 0.0)
    @sdk.set_state(entity, state_vy, 0.0)
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
