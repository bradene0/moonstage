// Ball: when it touches the bucket it reports `caught` and removes itself;
// it also removes itself once it falls out of the world.
// Collision events arrive once per entity in the pair: source is the entity
// the event is about, value is the other entity's handle.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int32) -> Unit {
  ()
}

///|
pub fn ms_update(entity : Int32, _dt : Double) -> Unit {
  if @sdk.y(entity) > @sdk.param(param_floor_y) {
    @sdk.remove(entity)
  }
}

///|
pub fn ms_event(entity : Int32, event : Int32, source : Int32, value : Double) -> Unit {
  if event != event_collision || source != entity || !@sdk.exists(entity) {
    return
  }
  if value.to_int() == @sdk.ref_entity(ref_bucket) {
    @sdk.emit(event_caught, 1.0)
    @sdk.remove(entity)
  }
}
