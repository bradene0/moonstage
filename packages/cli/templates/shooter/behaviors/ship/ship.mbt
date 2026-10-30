// Ship: moves along the bottom, fires bullets with a cooldown, and loses a
// life on every `hit`; at zero lives the game switches to the "over" scene.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  @sdk.set_state(entity, state_lives, @sdk.param(param_lives))
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  let x = @sdk.x(entity) + @sdk.input(input_move_x) * @sdk.param(param_speed) * dt
  @sdk.set_x(entity, @sdk.clamp(x, @sdk.param(param_min_x), @sdk.param(param_max_x)))
  let cool = @sdk.state(entity, state_cool) - dt
  if @sdk.input(input_fire) > 0.5 && cool <= 0.0 {
    @sdk.spawn_at(prefab_bullet, @sdk.x(entity), @sdk.y(entity) - 20.0) |> ignore
    @sdk.set_state(entity, state_cool, @sdk.param(param_cooldown))
  } else {
    @sdk.set_state(entity, state_cool, cool)
  }
}

///|
pub fn ms_event(entity : Int32, _event : Int32, _source : Int32, _value : Double) -> Unit {
  // `hit` is the only event this module declares.
  let lives = @sdk.state(entity, state_lives) - 1.0
  @sdk.set_state(entity, state_lives, lives)
  if lives <= 0.0 {
    @sdk.load_scene(scene_over)
  }
}
