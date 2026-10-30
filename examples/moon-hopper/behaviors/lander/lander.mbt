// Lander: rotate with the `turn` axis, fire the engine with `thrust`,
// fall under gravity and bounce off the world bounds.

// Param slots (order of `params` in moonstage.json).

///|
let p_thrust : Int = 0

///|
let p_gravity : Int = 1

///|
let p_turn_speed : Int = 2

///|
let p_bounce : Int = 3

///|
let p_min_x : Int = 4

///|
let p_max_x : Int = 5

///|
let p_min_y : Int = 6

///|
let p_max_y : Int = 7

// State, ref and input slots.

///|
let s_vx : Int = 0

///|
let s_vy : Int = 1

///|
let r_flame : Int = 0

///|
let in_turn : Int = 0

///|
let in_thrust : Int = 1

///|
pub fn ms_abi_version() -> Int {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int) -> Unit {
  ()
}

///|
pub fn ms_update(entity : Int, dt : Double) -> Unit {
  let rot = @sdk.rotation(entity) +
    @sdk.input(in_turn) * @sdk.param(p_turn_speed) * dt
  @sdk.set_rotation(entity, rot)
  let thrusting = @sdk.input(in_thrust) > 0.5
  let mut vx = @sdk.state(entity, s_vx)
  let mut vy = @sdk.state(entity, s_vy) + @sdk.param(p_gravity) * dt
  if thrusting {
    // Rotation 0 points the nose up (negative y).
    vx = vx + @math.sin(rot) * @sdk.param(p_thrust) * dt
    vy = vy - @math.cos(rot) * @sdk.param(p_thrust) * dt
  }
  let mut x = @sdk.x(entity) + vx * dt
  let mut y = @sdk.y(entity) + vy * dt
  let bounce = @sdk.param(p_bounce)
  if x < @sdk.param(p_min_x) {
    x = @sdk.param(p_min_x)
    vx = -vx * bounce
  } else if x > @sdk.param(p_max_x) {
    x = @sdk.param(p_max_x)
    vx = -vx * bounce
  }
  if y < @sdk.param(p_min_y) {
    y = @sdk.param(p_min_y)
    vy = -vy * bounce
  } else if y > @sdk.param(p_max_y) {
    // Ground contact: bounce, apply friction, and settle small bounces.
    y = @sdk.param(p_max_y)
    vy = -vy * bounce
    vx = vx * 0.9
    if vy > -20.0 {
      vy = 0.0
    }
  }
  @sdk.set_position(entity, x, y)
  @sdk.set_state(entity, s_vx, vx)
  @sdk.set_state(entity, s_vy, vy)
  let flame = @sdk.ref_entity(r_flame)
  if flame != @sdk.no_entity {
    @sdk.set_active(flame, thrusting)
  }
}

///|
pub fn ms_event(_entity : Int, _event : Int, _source : Int, _value : Double) -> Unit {
  ()
}
