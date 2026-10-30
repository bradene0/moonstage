// Crystal: when the lander gets close, emits `collected`, bursts into
// sparkles and respawns at a random (seeded) position. Its pulsing comes from
// the separate `pulse` behavior listed on the same entity.

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
  let lander = @sdk.ref_entity(ref_lander)
  if !@sdk.exists(lander) ||
    @sdk.distance(entity, lander) >= @sdk.param(param_pickup_radius) {
    return
  }
  @sdk.emit(event_collected, @sdk.param(param_value))
  let x = @sdk.x(entity)
  let y = @sdk.y(entity)
  let burst = @sdk.param(param_burst).to_int()
  for i = 0; i < burst; i = i + 1 {
    @sdk.spawn_at(prefab_sparkle, x, y) |> ignore
  }
  @sdk.set_position(
    entity,
    @sdk.random_range(@sdk.param(param_min_x), @sdk.param(param_max_x)),
    @sdk.random_range(@sdk.param(param_min_y), @sdk.param(param_max_y)),
  )
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
