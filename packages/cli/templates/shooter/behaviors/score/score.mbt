// Score: counts `destroyed` events and keeps a saved best score.

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
  let points = @sdk.state(entity, state_points) + value
  @sdk.set_state(entity, state_points, points)
  if points > @sdk.state(entity, state_best) {
    @sdk.set_state(entity, state_best, points)
    @sdk.store_save(save_best, points)
  }
}
