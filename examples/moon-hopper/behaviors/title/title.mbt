// Title: waits for the thrust button, then switches to the game scene.

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
  if @sdk.input(input_thrust) > 0.5 {
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
