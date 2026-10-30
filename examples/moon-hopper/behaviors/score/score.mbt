// Score: adds the payload of every `collected` event to `points`, and keeps
// the best score across sessions with a save (persisted by the player).

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  @sdk.set_state(entity, state_best, @sdk.load_save(save_best))
}

///|
pub fn ms_update(_entity : Int32, _dt : Double) -> Unit {
  ()
}

///|
pub fn ms_event(entity : Int32, _event : Int32, _source : Int32, value : Double) -> Unit {
  // `collected` is the only event this module declares, so no need to check `event`.
  let points = @sdk.state(entity, state_points) + value
  @sdk.set_state(entity, state_points, points)
  if points > @sdk.state(entity, state_best) {
    @sdk.set_state(entity, state_best, points)
    @sdk.store_save(save_best, points)
  }
}
