// Score: adds the payload of every `collected` event to `points`.

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
pub fn ms_event(
  entity : Int32,
  _event : Int32,
  _source : Int32,
  value : Double,
) -> Unit {
  // `collected` is the only event this module declares, so no need to check `event`.
  @sdk.set_state(entity, state_points, @sdk.state(entity, state_points) + value)
}
