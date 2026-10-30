// Spawner: drops enemies at random x positions, a little faster over time.

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
  let timer = @sdk.state(entity, state_timer) - dt
  if timer > 0.0 {
    @sdk.set_state(entity, state_timer, timer)
    return
  }
  let x = @sdk.random_range(@sdk.param(param_min_x), @sdk.param(param_max_x))
  @sdk.spawn_at(prefab_enemy, x, @sdk.y(entity)) |> ignore
  let interval = @sdk.clamp(
    @sdk.param(param_interval) - @sdk.time() * 0.01,
    @sdk.param(param_min_interval),
    @sdk.param(param_interval),
  )
  @sdk.set_state(entity, state_timer, interval)
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
