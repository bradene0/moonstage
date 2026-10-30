// Slots follow the order of the lists declared for "mover" in moonstage.json.

///|
let p_speed : Int = 0

///|
let p_min_x : Int = 1

///|
let p_max_x : Int = 2

///|
let p_min_y : Int = 3

///|
let p_max_y : Int = 4

///|
let in_move_x : Int = 0

///|
let in_move_y : Int = 1

///|
pub fn ms_abi_version() -> Int {
  @sdk.abi_version
}

///|
pub fn ms_start(_entity : Int) -> Unit {
  ()
}

///|
pub fn ms_update(entity : Int, dt : Double) -> Unit {
  let speed = @sdk.param(p_speed)
  let x = @sdk.x(entity) + @sdk.input(in_move_x) * speed * dt
  let y = @sdk.y(entity) + @sdk.input(in_move_y) * speed * dt
  @sdk.set_position(
    entity,
    @sdk.clamp(x, @sdk.param(p_min_x), @sdk.param(p_max_x)),
    @sdk.clamp(y, @sdk.param(p_min_y), @sdk.param(p_max_y)),
  )
}

///|
pub fn ms_event(_entity : Int, _event : Int, _source : Int, _value : Double) -> Unit {
  ()
}
