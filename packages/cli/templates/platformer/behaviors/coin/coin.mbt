// Coin: spins, and when the player touches it (a physics collision event
// with the player's handle as the value) reports `collected` and disappears.

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
  @sdk.set_rotation(entity, @sdk.rotation(entity) + 3.0 * dt)
}

///|
pub fn ms_event(entity : Int32, event : Int32, source : Int32, value : Double) -> Unit {
  if event != event_collision || source != entity || !@sdk.exists(entity) {
    return
  }
  if value.to_int() == @sdk.ref_entity(ref_player) {
    @sdk.emit(event_collected, @sdk.param(param_value))
    @sdk.remove(entity)
  }
}
