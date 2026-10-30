// Enemy: drifts down. On a collision it checks what it touched: a bullet
// destroys both (`destroyed`), the ship takes a `hit`.

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
  let y = @sdk.y(entity) + @sdk.param(param_speed) * dt
  @sdk.set_y(entity, y)
  @sdk.set_rotation(entity, @sdk.rotation(entity) + dt)
  if y > @sdk.param(param_bottom) {
    @sdk.remove(entity)
  }
}

///|
pub fn ms_event(entity : Int32, event : Int32, source : Int32, value : Double) -> Unit {
  if event != event_collision || source != entity || !@sdk.exists(entity) {
    return
  }
  let other = value.to_int()
  if @sdk.is_prefab(other, prefab_bullet) && @sdk.exists(other) {
    @sdk.remove(other)
    @sdk.remove(entity)
    @sdk.emit(event_destroyed, 1.0)
  } else if other == @sdk.ref_entity(ref_ship) {
    @sdk.remove(entity)
    @sdk.emit(event_hit, 1.0)
  }
}
