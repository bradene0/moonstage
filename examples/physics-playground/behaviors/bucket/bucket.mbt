// Bucket: a sensor whose catching is done by the balls themselves (see ball.mbt);
// it just counts `caught` events, so nothing else that touches it is affected.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int32) -> Unit {
  ()
}

///|
pub fn ms_update(_entity : Int32, _dt : Double) -> Unit {
  ()
}

///|
pub fn ms_event(entity : Int32, _event : Int32, _source : Int32, value : Double) -> Unit {
  @sdk.set_state(entity, state_count, @sdk.state(entity, state_count) + value)
}
