// Player: walks the tile maze with moveX/moveY, sliding along walls instead of entering solid tiles.
// Walking over a gem (any entity tagged "gem") collects it. When none are left the run is over: the
// banner shows, and a faster time than the saved best becomes the new best. R restarts.

///|
pub fn ms_abi_version() -> Int32 {
  @sdk.abi_version
}

///|
pub fn ms_start(entity : Int32) -> Unit {
  @sdk.set_state(entity, state_left, @sdk.count_tagged(tag_gem).to_double())
  @sdk.set_state(entity, state_best, @sdk.load_save(save_best))
}

///|
/// True if a box of half-size `half` centered at (x, y) would overlap a solid tile.
fn blocked(x : Double, y : Double, half : Double) -> Bool {
  let h = half - 0.01
  @sdk.tile_solid(x - h, y - h) ||
  @sdk.tile_solid(x + h, y - h) ||
  @sdk.tile_solid(x - h, y + h) ||
  @sdk.tile_solid(x + h, y + h)
}

///|
pub fn ms_update(entity : Int32, dt : Double) -> Unit {
  if @sdk.input(input_restart) > 0.5 {
    @sdk.load_scene(scene_main)
    return
  }
  if @sdk.state(entity, state_won) > 0.5 {
    return
  }
  @sdk.set_state(entity, state_time, @sdk.state(entity, state_time) + dt)
  // Move one axis at a time, so pushing diagonally into a wall still slides along it.
  let half = @sdk.param(param_size) * 0.5
  let step = @sdk.param(param_speed) * dt
  let nx = @sdk.x(entity) + @sdk.input(input_move_x) * step
  if !blocked(nx, @sdk.y(entity), half) {
    @sdk.set_x(entity, nx)
  }
  let ny = @sdk.y(entity) + @sdk.input(input_move_y) * step
  if !blocked(@sdk.x(entity), ny, half) {
    @sdk.set_y(entity, ny)
  }
  let gem = @sdk.nearest_tagged(tag_gem, entity)
  if gem != @sdk.no_entity && @sdk.distance(entity, gem) < @sdk.param(param_reach) {
    @sdk.remove(gem)
  }
  // Removed entities stop counting at once, so this already excludes a gem collected just now.
  let left = @sdk.count_tagged(tag_gem)
  @sdk.set_state(entity, state_left, left.to_double())
  if left == 0 {
    @sdk.set_state(entity, state_won, 1.0)
    @sdk.set_active(@sdk.ref_entity(ref_banner), true)
    let time = @sdk.state(entity, state_time)
    let best = @sdk.load_save(save_best)
    if best == 0.0 || time < best {
      @sdk.store_save(save_best, time)
      @sdk.set_state(entity, state_best, time)
    }
  }
}

///|
pub fn ms_event(_entity : Int32, _event : Int32, _source : Int32, _value : Double) -> Unit {

}
