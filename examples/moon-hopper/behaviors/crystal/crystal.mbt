// Crystal: pulses, and when the lander gets close emits `collected`
// and respawns at a random (seeded) position.

///|
let p_pickup_radius : Int = 0

///|
let p_value : Int = 1

///|
let p_min_x : Int = 2

///|
let p_max_x : Int = 3

///|
let p_min_y : Int = 4

///|
let p_max_y : Int = 5

///|
let s_phase : Int = 0

///|
let r_lander : Int = 0

///|
let e_collected : Int = 0

///|
pub fn ms_abi_version() -> Int {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int) -> Unit {
  // Desynchronize the pulse of each crystal.
  @sdk.set_state(entity, s_phase, @sdk.random() * 6.283)
}

///|
pub fn ms_update(entity : Int, dt : Double) -> Unit {
  let phase = @sdk.state(entity, s_phase) + dt * 4.0
  @sdk.set_state(entity, s_phase, phase)
  let pulse = 1.0 + 0.15 * @math.sin(phase)
  @sdk.set_scale(entity, pulse, pulse)
  let lander = @sdk.ref_entity(r_lander)
  if lander != @sdk.no_entity &&
    @sdk.distance(entity, lander) < @sdk.param(p_pickup_radius) {
    @sdk.emit(e_collected, @sdk.param(p_value))
    @sdk.set_position(
      entity,
      @sdk.random_range(@sdk.param(p_min_x), @sdk.param(p_max_x)),
      @sdk.random_range(@sdk.param(p_min_y), @sdk.param(p_max_y)),
    )
  }
}

///|
pub fn ms_event(_entity : Int, _event : Int, _source : Int, _value : Double) -> Unit {
  ()
}
