// Restart: on the game-over screen, fire starts a new game.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  @sdk.set_state(entity, state_wait, 0.5)
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  // A short pause so the button held when dying doesn't skip this screen.
  let wait = @sdk.state(entity, state_wait) - dt
  @sdk.set_state(entity, state_wait, wait)
  if wait <= 0.0 && @sdk.input(input_fire) > 0.5 {
    @sdk.load_scene(scene_main)
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
