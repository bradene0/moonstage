// Sparkle: a short-lived particle. Flies outward in a random direction,
// shrinks, and removes itself when its life runs out.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  let angle = @sdk.random() * 6.283
  let speed = @sdk.param(param_speed) * (0.5 + @sdk.random())
  @sdk.set_state(entity, state_vx, @math.cos(angle) * speed)
  @sdk.set_state(entity, state_vy, @math.sin(angle) * speed)
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  let age = @sdk.state(entity, state_age) + dt
  @sdk.set_state(entity, state_age, age)
  let life = @sdk.param(param_life)
  if age >= life {
    @sdk.remove(entity)
    return
  }
  @sdk.set_position(
    entity,
    @sdk.x(entity) + @sdk.state(entity, state_vx) * dt,
    @sdk.y(entity) + @sdk.state(entity, state_vy) * dt,
  )
  let s = 1.0 - age / life
  @sdk.set_scale(entity, s, s)
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
