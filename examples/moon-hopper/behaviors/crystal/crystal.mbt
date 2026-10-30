// Crystal: pulses, and when the lander gets close emits `collected`
// and respawns at a random (seeded) position.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  // Desynchronize the pulse of each crystal.
  @sdk.set_state(entity, state_phase, @sdk.random() * 6.283)
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  let phase = @sdk.state(entity, state_phase) + dt * 4.0
  @sdk.set_state(entity, state_phase, phase)
  let pulse = 1.0 + 0.15 * @math.sin(phase)
  @sdk.set_scale(entity, pulse, pulse)
  let lander = @sdk.ref_entity(ref_lander)
  if lander != @sdk.no_entity &&
    @sdk.distance(entity, lander) < @sdk.param(param_pickup_radius) {
    @sdk.emit(event_collected, @sdk.param(param_value))
    @sdk.set_position(
      entity,
      @sdk.random_range(@sdk.param(param_min_x), @sdk.param(param_max_x)),
      @sdk.random_range(@sdk.param(param_min_y), @sdk.param(param_max_y)),
    )
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
