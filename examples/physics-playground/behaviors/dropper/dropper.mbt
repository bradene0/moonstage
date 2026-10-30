// Dropper: spawns a ball prefab at a random x every `interval` seconds, up to `maxBalls`.

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
  let timer = @sdk.state(entity, state_timer) + dt
  let dropped = @sdk.state(entity, state_dropped)
  if timer < @sdk.param(param_interval) || dropped >= @sdk.param(param_max_balls) {
    @sdk.set_state(entity, state_timer, timer)
    return
  }
  let x = @sdk.random_range(@sdk.param(param_min_x), @sdk.param(param_max_x))
  @sdk.spawn_at(prefab_ball, x, @sdk.y(entity)) |> ignore
  @sdk.set_state(entity, state_timer, 0.0)
  @sdk.set_state(entity, state_dropped, dropped + 1.0)
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
