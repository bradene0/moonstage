// Pulse: a reusable scale animation. Combine it with other behaviors on the
// same entity, e.g. `"behavior": [{ "module": "pulse" }, { "module": "crystal" }]`.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  // Desynchronize entities that share the same parameters.
  @sdk.set_state(entity, state_phase, @sdk.random() * 6.283)
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  let phase = @sdk.state(entity, state_phase) + dt * @sdk.param(param_speed)
  @sdk.set_state(entity, state_phase, phase)
  let s = 1.0 + @sdk.param(param_amount) * @math.sin(phase)
  @sdk.set_scale(entity, s, s)
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
