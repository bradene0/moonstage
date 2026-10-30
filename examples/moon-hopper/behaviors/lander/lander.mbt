// Lander: rotate with the `turn` axis, fire the engine with `thrust`,
// fall under gravity and bounce off the world bounds.

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
  let rot = @sdk.rotation(entity) +
    @sdk.input(input_turn) * @sdk.param(param_turn_speed) * dt
  @sdk.set_rotation(entity, rot)
  let thrusting = @sdk.input(input_thrust) > 0.5
  let mut vx = @sdk.state(entity, state_vx)
  let mut vy = @sdk.state(entity, state_vy) + @sdk.param(param_gravity) * dt
  if thrusting {
    // Rotation 0 points the nose up (negative y).
    vx = vx + @math.sin(rot) * @sdk.param(param_thrust) * dt
    vy = vy - @math.cos(rot) * @sdk.param(param_thrust) * dt
  }
  let mut x = @sdk.x(entity) + vx * dt
  let mut y = @sdk.y(entity) + vy * dt
  let bounce = @sdk.param(param_bounce)
  if x < @sdk.param(param_min_x) {
    x = @sdk.param(param_min_x)
    vx = -vx * bounce
  } else if x > @sdk.param(param_max_x) {
    x = @sdk.param(param_max_x)
    vx = -vx * bounce
  }
  if y < @sdk.param(param_min_y) {
    y = @sdk.param(param_min_y)
    vy = -vy * bounce
  } else if y > @sdk.param(param_max_y) {
    // Ground contact: bounce, apply friction, and settle small bounces.
    y = @sdk.param(param_max_y)
    vy = -vy * bounce
    vx = vx * 0.9
    if vy > -20.0 {
      vy = 0.0
    }
  }
  @sdk.set_position(entity, x, y)
  @sdk.set_state(entity, state_vx, vx)
  @sdk.set_state(entity, state_vy, vy)
  let flame = @sdk.ref_entity(ref_flame)
  if flame != @sdk.no_entity {
    @sdk.set_active(flame, thrusting)
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
