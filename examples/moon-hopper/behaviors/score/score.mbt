// Score: adds the payload of every `collected` event to `points`.

///|
let s_points : Int = 0

///|
pub fn ms_abi_version() -> Int {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int) -> Unit {
  ()
}

///|
pub fn ms_update(_entity : Int, _dt : Double) -> Unit {
  ()
}

///|
pub fn ms_event(entity : Int, _event : Int, _source : Int, value : Double) -> Unit {
  // `collected` is the only event this module declares (slot 0).
  @sdk.set_state(entity, s_points, @sdk.state(entity, s_points) + value)
}
