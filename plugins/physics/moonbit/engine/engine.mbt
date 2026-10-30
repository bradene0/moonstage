// Moonstage physics: a small 2D rigid-body engine in MoonBit, compiled to
// WebAssembly and driven by the @moonstage/physics plugin.
//
// Bodies are circles or oriented boxes with full rotation. Each substep:
// integrate forces, find contacts (sweep-and-prune broad phase, SAT for
// boxes), solve contact, friction and joint impulses iteratively (with
// torque), then integrate positions. Units: pixels, seconds, radians.
//
// Data lives in parallel arrays indexed by body or joint id. Ids are never
// reused within a world; removed slots are marked dead.

// ---------------------------------------------------------------- bodies

///|
let kind : Array[Int] = [] // 0 static, 1 dynamic, 2 kinematic, -1 removed

///|
let shape : Array[Int] = [] // 0 circle, 1 box

///|
let px : Array[Double] = []

///|
let py : Array[Double] = []

///|
let ang : Array[Double] = []

///|
let vx : Array[Double] = []

///|
let vy : Array[Double] = []

///|
let av : Array[Double] = []

///|
let radius : Array[Double] = []

///|
let hw : Array[Double] = []

///|
let hh : Array[Double] = []

///|
let off_x : Array[Double] = []

///|
let off_y : Array[Double] = []

///|
let inv_mass : Array[Double] = []

///|
let inv_inertia : Array[Double] = []

///|
let friction : Array[Double] = []

///|
let restitution : Array[Double] = []

///|
let gravity_scale : Array[Double] = []

///|
let lin_damp : Array[Double] = []

///|
let ang_damp : Array[Double] = []

///|
let sensor : Array[Bool] = []

///|
let gravity : Array[Double] = [0.0, 980.0]

// ---------------------------------------------------------------- joints

///|
let j_kind : Array[Int] = [] // 0 distance, 1 pin (revolute), -1 removed

///|
let j_a : Array[Int] = []

///|
let j_b : Array[Int] = []

///|
let j_ax : Array[Double] = []

///|
let j_ay : Array[Double] = []

///|
let j_bx : Array[Double] = []

///|
let j_by : Array[Double] = []

///|
let j_len : Array[Double] = []

///|
let j_motor_on : Array[Bool] = []

///|
let j_motor_speed : Array[Double] = []

///|
let j_motor_max : Array[Double] = []

// ---------------------------------------------------------------- contacts

///|
let c_a : Array[Int] = []

///|
let c_b : Array[Int] = []

///|
let c_nx : Array[Double] = []

///|
let c_ny : Array[Double] = []

///|
let c_px : Array[Double] = []

///|
let c_py : Array[Double] = []

///|
let c_depth : Array[Double] = []

///|
let c_kn : Array[Double] = []

///|
let c_kt : Array[Double] = []

///|
let c_target : Array[Double] = []

///|
let c_jn : Array[Double] = []

///|
let c_jt : Array[Double] = []

///|
/// Stable identity of each contact (pair + point index), for warm starting.
let c_key : Array[Int64] = []

///|
/// Impulses from the previous substep, by contact key. Starting the solver from
/// them (warm starting) is what keeps stacks from slowly creeping apart.
let warm_n : Map[Int64, Double] = {}

///|
let warm_t : Map[Int64, Double] = {}

///|
/// Touching pairs from the last step (a < b), reported to the plugin.
let t_a : Array[Int] = []

///|
let t_b : Array[Int] = []

///|
let order : Array[Int] = []

///|
let min_x : Array[Double] = []

///|
let max_x : Array[Double] = []

///|
let min_y : Array[Double] = []

///|
let max_y : Array[Double] = []

///|
/// Approach speeds below this (px/s) don't bounce, so resting bodies settle.
let rest_speed : Double = 30.0

///|
let slop : Double = 0.5

///|
let baumgarte : Double = 0.2

// ---------------------------------------------------------------- helpers

///|
fn fmax(a : Double, b : Double) -> Double {
  if a > b {
    a
  } else {
    b
  }
}

///|
fn fmin(a : Double, b : Double) -> Double {
  if a < b {
    a
  } else {
    b
  }
}

///|
fn clamp(v : Double, lo : Double, hi : Double) -> Double {
  fmin(fmax(v, lo), hi)
}

///|
fn sign(v : Double) -> Double {
  if v < 0.0 {
    -1.0
  } else {
    1.0
  }
}

///|
fn alive(i : Int) -> Bool {
  i >= 0 && i < kind.length() && kind[i] >= 0
}

///|
fn shape_x(i : Int) -> Double {
  px[i] + off_x[i] * @math.cos(ang[i]) - off_y[i] * @math.sin(ang[i])
}

///|
fn shape_y(i : Int) -> Double {
  py[i] + off_x[i] * @math.sin(ang[i]) + off_y[i] * @math.cos(ang[i])
}

// ---------------------------------------------------------------- world API

///|
pub fn reset() -> Unit {
  for list in [kind, shape, j_kind, j_a, j_b, c_a, c_b, t_a, t_b, order] {
    list.clear()
  }
  for list in [
    px, py, ang, vx, vy, av, radius, hw, hh, off_x, off_y, inv_mass, inv_inertia,
    friction, restitution, gravity_scale, lin_damp, ang_damp, j_ax, j_ay, j_bx, j_by,
    j_len, j_motor_speed, j_motor_max, c_nx, c_ny, c_px, c_py, c_depth, c_kn, c_kt,
    c_target, c_jn, c_jt, min_x, max_x, min_y, max_y,
  ] {
    list.clear()
  }
  sensor.clear()
  j_motor_on.clear()
  c_key.clear()
  warm_n.clear()
  warm_t.clear()
  gravity[0] = 0.0
  gravity[1] = 980.0
}

///|
pub fn set_gravity(gx : Double, gy : Double) -> Unit {
  gravity[0] = gx
  gravity[1] = gy
}

///|
/// Add a body: kind 0 static, 1 dynamic, 2 kinematic; shape 0 circle (a = radius), 1 box (a × b size).
/// Returns its id. Mass defaults to area / 100 (set_mass changes it).
pub fn add_body(body_kind : Int, body_shape : Int, a : Double, b : Double) -> Int {
  let id = kind.length()
  kind.push(body_kind)
  shape.push(body_shape)
  for list in [px, py, ang, vx, vy, av, off_x, off_y, lin_damp, ang_damp] {
    list.push(0.0)
  }
  radius.push(if body_shape == 0 { a } else { 0.0 })
  hw.push(if body_shape == 1 { a / 2.0 } else { a })
  hh.push(if body_shape == 1 { b / 2.0 } else { a })
  inv_mass.push(0.0)
  inv_inertia.push(0.0)
  friction.push(0.3)
  restitution.push(0.0)
  gravity_scale.push(1.0)
  sensor.push(false)
  set_mass(id, 0.0, 1.0, 0)
  id
}

///|
pub fn remove_body(i : Int) -> Unit {
  if !alive(i) {
    return
  }
  kind[i] = -1
  for j = 0; j < j_kind.length(); j = j + 1 {
    if j_a[j] == i || j_b[j] == i {
      j_kind[j] = -1
    }
  }
}

///|
/// Mass properties. mass <= 0 uses density × area / 100. fixed_rotation != 0 disables rotation.
pub fn set_mass(i : Int, mass : Double, density : Double, fixed_rotation : Int) -> Unit {
  if !alive(i) {
    return
  }
  if kind[i] != 1 {
    inv_mass[i] = 0.0
    inv_inertia[i] = 0.0
    return
  }
  let area = if shape[i] == 0 {
    3.141592653589793 * radius[i] * radius[i]
  } else {
    4.0 * hw[i] * hh[i]
  }
  let m = if mass > 0.0 { mass } else { fmax(density, 0.0001) * area / 100.0 }
  let inertia = if shape[i] == 0 {
    0.5 * m * radius[i] * radius[i]
  } else {
    m * (4.0 * hw[i] * hw[i] + 4.0 * hh[i] * hh[i]) / 12.0
  }
  inv_mass[i] = 1.0 / m
  inv_inertia[i] = if fixed_rotation != 0 { 0.0 } else { 1.0 / inertia }
}

///|
pub fn set_material(i : Int, fr : Double, rest : Double, is_sensor : Int) -> Unit {
  if alive(i) {
    friction[i] = fr
    restitution[i] = rest
    sensor[i] = is_sensor != 0
  }
}

///|
pub fn set_motion(i : Int, gscale : Double, linear : Double, angular : Double) -> Unit {
  if alive(i) {
    gravity_scale[i] = gscale
    lin_damp[i] = linear
    ang_damp[i] = angular
  }
}

///|
pub fn set_offset(i : Int, x : Double, y : Double) -> Unit {
  if alive(i) {
    off_x[i] = x
    off_y[i] = y
  }
}

///|
pub fn set_pose(i : Int, x : Double, y : Double, angle : Double) -> Unit {
  if alive(i) {
    px[i] = x
    py[i] = y
    ang[i] = angle
  }
}

///|
pub fn set_velocity(i : Int, x : Double, y : Double, angular : Double) -> Unit {
  if alive(i) {
    vx[i] = x
    vy[i] = y
    av[i] = angular
  }
}

///|
pub fn body_x(i : Int) -> Double {
  px[i]
}

///|
pub fn body_y(i : Int) -> Double {
  py[i]
}

///|
pub fn body_angle(i : Int) -> Double {
  ang[i]
}

///|
pub fn body_vx(i : Int) -> Double {
  vx[i]
}

///|
pub fn body_vy(i : Int) -> Double {
  vy[i]
}

///|
pub fn body_av(i : Int) -> Double {
  av[i]
}

///|
/// Joint between bodies a and b at local anchors: kind 0 distance (length; < 0 = current distance),
/// 1 pin (anchors held together; a revolute joint).
pub fn add_joint(
  joint_kind : Int,
  a : Int,
  b : Int,
  ax : Double,
  ay : Double,
  bx : Double,
  by : Double,
  length : Double,
) -> Int {
  let id = j_kind.length()
  j_kind.push(joint_kind)
  j_a.push(a)
  j_b.push(b)
  j_ax.push(ax)
  j_ay.push(ay)
  j_bx.push(bx)
  j_by.push(by)
  let dx = anchor_x(b, bx, by) - anchor_x(a, ax, ay)
  let dy = anchor_y(b, bx, by) - anchor_y(a, ax, ay)
  j_len.push(
    if joint_kind == 1 {
      0.0
    } else if length < 0.0 {
      (dx * dx + dy * dy).sqrt()
    } else {
      length
    },
  )
  j_motor_on.push(false)
  j_motor_speed.push(0.0)
  j_motor_max.push(0.0)
  id
}

///|
/// Drive a pin joint's relative angular velocity toward speed (rad/s) with at most max_torque.
pub fn set_motor(j : Int, speed : Double, max_torque : Double) -> Unit {
  if j >= 0 && j < j_kind.length() {
    j_motor_on[j] = true
    j_motor_speed[j] = speed
    j_motor_max[j] = max_torque
  }
}

///|
pub fn remove_joint(j : Int) -> Unit {
  if j >= 0 && j < j_kind.length() {
    j_kind[j] = -1
  }
}

///|
pub fn contact_count() -> Int {
  t_a.length()
}

///|
pub fn contact_a(k : Int) -> Int {
  t_a[k]
}

///|
pub fn contact_b(k : Int) -> Int {
  t_b[k]
}

///|
fn anchor_x(i : Int, lx : Double, ly : Double) -> Double {
  px[i] + lx * @math.cos(ang[i]) - ly * @math.sin(ang[i])
}

///|
fn anchor_y(i : Int, lx : Double, ly : Double) -> Double {
  py[i] + lx * @math.sin(ang[i]) + ly * @math.cos(ang[i])
}

// ---------------------------------------------------------------- collision

///|
fn add_contact(
  a : Int,
  b : Int,
  nx : Double,
  ny : Double,
  x : Double,
  y : Double,
  depth : Double,
) -> Unit {
  c_a.push(a)
  c_b.push(b)
  c_nx.push(nx)
  c_ny.push(ny)
  c_px.push(x)
  c_py.push(y)
  c_depth.push(depth)
  c_kn.push(0.0)
  c_kt.push(0.0)
  c_target.push(0.0)
  c_jn.push(0.0)
  c_jt.push(0.0)
  c_key.push(0L)
}

///|
fn circle_circle(a : Int, b : Int) -> Bool {
  let ax = shape_x(a)
  let ay = shape_y(a)
  let dx = shape_x(b) - ax
  let dy = shape_y(b) - ay
  let dist = (dx * dx + dy * dy).sqrt()
  let depth = radius[a] + radius[b] - dist
  if depth <= 0.0 {
    return false
  }
  let nx = if dist > 0.000001 { dx / dist } else { 0.0 }
  let ny = if dist > 0.000001 { dy / dist } else { 1.0 }
  add_contact(a, b, nx, ny, ax + nx * radius[a], ay + ny * radius[a], depth)
  true
}

///|
/// Circle c against box q; the normal is stored from `first` to `second`.
fn circle_box(c : Int, q : Int, circle_first : Bool) -> Bool {
  let cos = @math.cos(ang[q])
  let sin = @math.sin(ang[q])
  let qx = shape_x(q)
  let qy = shape_y(q)
  let dx = shape_x(c) - qx
  let dy = shape_y(c) - qy
  // Circle center in the box's local frame.
  let lx = dx * cos + dy * sin
  let ly = -dx * sin + dy * cos
  let cx = clamp(lx, -hw[q], hw[q])
  let cy = clamp(ly, -hh[q], hh[q])
  let mut nlx = lx - cx
  let mut nly = ly - cy
  let dist = (nlx * nlx + nly * nly).sqrt()
  let mut depth = 0.0
  let mut kx = cx
  let mut ky = cy
  if dist < 0.000001 {
    // Center inside the box: push out through the nearest face.
    let ex = hw[q] - lx.abs()
    let ey = hh[q] - ly.abs()
    if ex < ey {
      nlx = sign(lx)
      nly = 0.0
      kx = sign(lx) * hw[q]
      depth = ex + radius[c]
    } else {
      nlx = 0.0
      nly = sign(ly)
      ky = sign(ly) * hh[q]
      depth = ey + radius[c]
    }
  } else {
    depth = radius[c] - dist
    if depth <= 0.0 {
      return false
    }
    nlx = nlx / dist
    nly = nly / dist
  }
  // World normal pointing from the box to the circle, and the contact point on the box.
  let nx = nlx * cos - nly * sin
  let ny = nlx * sin + nly * cos
  let wx = qx + kx * cos - ky * sin
  let wy = qy + kx * sin + ky * cos
  if circle_first {
    add_contact(c, q, -nx, -ny, wx, wy, depth)
  } else {
    add_contact(q, c, nx, ny, wx, wy, depth)
  }
  true
}

///|
fn box_corner_x(i : Int, sx : Double, sy : Double) -> Double {
  shape_x(i) + sx * hw[i] * @math.cos(ang[i]) - sy * hh[i] * @math.sin(ang[i])
}

///|
fn box_corner_y(i : Int, sx : Double, sy : Double) -> Double {
  shape_y(i) + sx * hw[i] * @math.sin(ang[i]) + sy * hh[i] * @math.cos(ang[i])
}

///|
/// Penetration of point (x, y) into box i, or a negative number when outside.
fn inside_box(i : Int, x : Double, y : Double) -> Double {
  let cos = @math.cos(ang[i])
  let sin = @math.sin(ang[i])
  let dx = x - shape_x(i)
  let dy = y - shape_y(i)
  let lx = dx * cos + dy * sin
  let ly = -dx * sin + dy * cos
  fmin(hw[i] - lx.abs(), hh[i] - ly.abs())
}

///|
fn box_box(a : Int, b : Int) -> Bool {
  let dx = shape_x(b) - shape_x(a)
  let dy = shape_y(b) - shape_y(a)
  let mut best = 1.0e300
  let mut nx = 0.0
  let mut ny = 0.0
  // Separating-axis test on both boxes' face normals.
  for k = 0; k < 4; k = k + 1 {
    let owner = if k < 2 { a } else { b }
    let t = ang[owner] + (if k % 2 == 0 { 0.0 } else { 1.5707963267948966 })
    let lx = @math.cos(t)
    let ly = @math.sin(t)
    let ra = hw[a] * (@math.cos(ang[a]) * lx + @math.sin(ang[a]) * ly).abs() +
      hh[a] * (-@math.sin(ang[a]) * lx + @math.cos(ang[a]) * ly).abs()
    let rb = hw[b] * (@math.cos(ang[b]) * lx + @math.sin(ang[b]) * ly).abs() +
      hh[b] * (-@math.sin(ang[b]) * lx + @math.cos(ang[b]) * ly).abs()
    let d = dx * lx + dy * ly
    let overlap = ra + rb - d.abs()
    if overlap <= 0.0 {
      return false
    }
    if overlap < best {
      best = overlap
      nx = lx * sign(d)
      ny = ly * sign(d)
    }
  }
  // Contact points: corners of each box inside the other (at most two, deepest first).
  let mut found = 0
  for pass = 0; pass < 2; pass = pass + 1 {
    let owner = if pass == 0 { b } else { a }
    let other = if pass == 0 { a } else { b }
    for k = 0; k < 4; k = k + 1 {
      if found >= 2 {
        break
      }
      let sx = if k == 0 || k == 3 { -1.0 } else { 1.0 }
      let sy = if k < 2 { -1.0 } else { 1.0 }
      let x = box_corner_x(owner, sx, sy)
      let y = box_corner_y(owner, sx, sy)
      let inside = inside_box(other, x, y)
      if inside > -0.01 {
        // Each corner's own penetration, so a slightly tilted box is not pushed as if fully sunk.
        add_contact(a, b, nx, ny, x, y, clamp(inside, 0.0, best))
        found = found + 1
      }
    }
  }
  if found == 0 {
    add_contact(a, b, nx, ny, shape_x(a) + dx * 0.5, shape_y(a) + dy * 0.5, best)
  }
  true
}

///|
fn collide(a : Int, b : Int) -> Bool {
  if shape[a] == 0 && shape[b] == 0 {
    circle_circle(a, b)
  } else if shape[a] == 1 && shape[b] == 1 {
    box_box(a, b)
  } else if shape[a] == 0 {
    circle_box(a, b, true)
  } else {
    circle_box(b, a, false)
  }
}

///|
fn compute_bounds(i : Int) -> Unit {
  let x = shape_x(i)
  let y = shape_y(i)
  let ex = if shape[i] == 0 {
    radius[i]
  } else {
    hw[i] * @math.cos(ang[i]).abs() + hh[i] * @math.sin(ang[i]).abs()
  }
  let ey = if shape[i] == 0 {
    radius[i]
  } else {
    hw[i] * @math.sin(ang[i]).abs() + hh[i] * @math.cos(ang[i]).abs()
  }
  min_x[i] = x - ex
  max_x[i] = x + ex
  min_y[i] = y - ey
  max_y[i] = y + ey
}

///|
/// Sweep-and-prune along x, then narrow phase. Fills the contact arrays.
fn detect(record : Bool) -> Unit {
  for list in [c_a, c_b] {
    list.clear()
  }
  for list in [c_nx, c_ny, c_px, c_py, c_depth, c_kn, c_kt, c_target, c_jn, c_jt] {
    list.clear()
  }
  c_key.clear()
  if record {
    t_a.clear()
    t_b.clear()
  }
  let n = kind.length()
  while min_x.length() < n {
    min_x.push(0.0)
    max_x.push(0.0)
    min_y.push(0.0)
    max_y.push(0.0)
  }
  order.clear()
  for i = 0; i < n; i = i + 1 {
    if kind[i] >= 0 {
      compute_bounds(i)
      order.push(i)
    }
  }
  // Insertion sort by min_x (stable and fast for nearly sorted input).
  for i = 1; i < order.length(); i = i + 1 {
    let item = order[i]
    let mut j = i - 1
    while j >= 0 && min_x[order[j]] > min_x[item] {
      order[j + 1] = order[j]
      j = j - 1
    }
    order[j + 1] = item
  }
  for i = 0; i < order.length(); i = i + 1 {
    let p = order[i]
    for k = i + 1; k < order.length(); k = k + 1 {
      let q = order[k]
      if min_x[q] > max_x[p] {
        break
      }
      if min_y[q] > max_y[p] || min_y[p] > max_y[q] {
        continue
      }
      let a = if p < q { p } else { q }
      let b = if p < q { q } else { p }
      if inv_mass[a] == 0.0 && inv_mass[b] == 0.0 && !sensor[a] && !sensor[b] {
        continue
      }
      let before = c_a.length()
      if collide(a, b) {
        for k = before; k < c_a.length(); k = k + 1 {
          c_key[k] = (a.to_int64() * 1048576L + b.to_int64()) * 4L + (k - before).to_int64()
        }
        if record {
          t_a.push(a)
          t_b.push(b)
        }
        if sensor[a] || sensor[b] {
          // Sensors report overlaps but never respond physically.
          while c_a.length() > before {
            pop_contact()
          }
        }
      }
    }
  }
}

///|
fn pop_contact() -> Unit {
  for list in [c_a, c_b] {
    list.pop() |> ignore
  }
  for list in [c_nx, c_ny, c_px, c_py, c_depth, c_kn, c_kt, c_target, c_jn, c_jt] {
    list.pop() |> ignore
  }
  c_key.pop() |> ignore
}

// ---------------------------------------------------------------- solver

///|
fn point_vx(i : Int, ry : Double) -> Double {
  vx[i] - av[i] * ry
}

///|
fn point_vy(i : Int, rx : Double) -> Double {
  vy[i] + av[i] * rx
}

///|
fn apply_impulse(
  i : Int,
  rx : Double,
  ry : Double,
  jx : Double,
  jy : Double,
  s : Double,
) -> Unit {
  vx[i] = vx[i] + s * jx * inv_mass[i]
  vy[i] = vy[i] + s * jy * inv_mass[i]
  av[i] = av[i] + s * (rx * jy - ry * jx) * inv_inertia[i]
}

///|
fn prepare_contacts(h : Double) -> Unit {
  for k = 0; k < c_a.length(); k = k + 1 {
    let a = c_a[k]
    let b = c_b[k]
    let nx = c_nx[k]
    let ny = c_ny[k]
    let rax = c_px[k] - px[a]
    let ray = c_py[k] - py[a]
    let rbx = c_px[k] - px[b]
    let rby = c_py[k] - py[b]
    let ran = rax * ny - ray * nx
    let rbn = rbx * ny - rby * nx
    c_kn[k] = inv_mass[a] + inv_mass[b] + ran * ran * inv_inertia[a] +
      rbn * rbn * inv_inertia[b]
    let ran_t = rax * nx + ray * ny
    let rbn_t = rbx * nx + rby * ny
    c_kt[k] = inv_mass[a] + inv_mass[b] + ran_t * ran_t * inv_inertia[a] +
      rbn_t * rbn_t * inv_inertia[b]
    let rvx = point_vx(b, rby) - point_vx(a, ray)
    let rvy = point_vy(b, rbx) - point_vy(a, rax)
    let vn = rvx * nx + rvy * ny
    let bounce = if -vn > rest_speed {
      -vn * fmax(restitution[a], restitution[b])
    } else {
      0.0
    }
    // Push penetrating bodies apart (Baumgarte), but never less than the bounce.
    c_target[k] = fmax(bounce, baumgarte / h * fmax(c_depth[k] - slop, 0.0))
    // Warm start from last substep's impulses for the same contact.
    let jn = warm_n.get(c_key[k]).unwrap_or(0.0)
    let jt = warm_t.get(c_key[k]).unwrap_or(0.0)
    c_jn[k] = jn
    c_jt[k] = jt
    let tx = -ny
    let ty = nx
    apply_impulse(a, rax, ray, nx * jn + tx * jt, ny * jn + ty * jt, -1.0)
    apply_impulse(b, rbx, rby, nx * jn + tx * jt, ny * jn + ty * jt, 1.0)
  }
}

///|
fn store_warm_start() -> Unit {
  warm_n.clear()
  warm_t.clear()
  for k = 0; k < c_a.length(); k = k + 1 {
    warm_n.set(c_key[k], c_jn[k])
    warm_t.set(c_key[k], c_jt[k])
  }
}

///|
fn solve_contacts() -> Unit {
  for k = 0; k < c_a.length(); k = k + 1 {
    if c_kn[k] <= 0.0 {
      continue
    }
    let a = c_a[k]
    let b = c_b[k]
    let nx = c_nx[k]
    let ny = c_ny[k]
    let rax = c_px[k] - px[a]
    let ray = c_py[k] - py[a]
    let rbx = c_px[k] - px[b]
    let rby = c_py[k] - py[b]
    let rvx = point_vx(b, rby) - point_vx(a, ray)
    let rvy = point_vy(b, rbx) - point_vy(a, rax)
    let vn = rvx * nx + rvy * ny
    let lambda = (c_target[k] - vn) / c_kn[k]
    let total = fmax(c_jn[k] + lambda, 0.0)
    let dj = total - c_jn[k]
    c_jn[k] = total
    apply_impulse(a, rax, ray, nx, ny, -dj)
    apply_impulse(b, rbx, rby, nx, ny, dj)
    // Coulomb friction along the tangent, bounded by the normal impulse.
    let tx = -ny
    let ty = nx
    let rvx2 = point_vx(b, rby) - point_vx(a, ray)
    let rvy2 = point_vy(b, rbx) - point_vy(a, rax)
    let vt = rvx2 * tx + rvy2 * ty
    let mu = (friction[a] * friction[b]).sqrt()
    let max_f = mu * c_jn[k]
    let ft = clamp(c_jt[k] - vt / c_kt[k], -max_f, max_f)
    let dt_ = ft - c_jt[k]
    c_jt[k] = ft
    apply_impulse(a, rax, ray, tx, ty, -dt_)
    apply_impulse(b, rbx, rby, tx, ty, dt_)
  }
}

///|
fn solve_joints(h : Double) -> Unit {
  for j = 0; j < j_kind.length(); j = j + 1 {
    let a = j_a[j]
    let b = j_b[j]
    if j_kind[j] < 0 || !alive(a) || !alive(b) {
      continue
    }
    let ax = anchor_x(a, j_ax[j], j_ay[j])
    let ay = anchor_y(a, j_ax[j], j_ay[j])
    let bx = anchor_x(b, j_bx[j], j_by[j])
    let by = anchor_y(b, j_bx[j], j_by[j])
    let rax = ax - px[a]
    let ray = ay - py[a]
    let rbx = bx - px[b]
    let rby = by - py[b]
    let rvx = point_vx(b, rby) - point_vx(a, ray)
    let rvy = point_vy(b, rbx) - point_vy(a, rax)
    let ima = inv_mass[a]
    let imb = inv_mass[b]
    let iia = inv_inertia[a]
    let iib = inv_inertia[b]
    if j_kind[j] == 1 {
      // Point constraint: solve the 2×2 effective-mass system for the anchor velocity error.
      let k11 = ima + imb + iia * ray * ray + iib * rby * rby
      let k12 = -iia * rax * ray - iib * rbx * rby
      let k22 = ima + imb + iia * rax * rax + iib * rbx * rbx
      let det = k11 * k22 - k12 * k12
      if det.abs() > 0.000000001 {
        let ex = rvx + baumgarte / h * (bx - ax)
        let ey = rvy + baumgarte / h * (by - ay)
        let jx = -(k22 * ex - k12 * ey) / det
        let jy = -(-k12 * ex + k11 * ey) / det
        apply_impulse(a, rax, ray, jx, jy, -1.0)
        apply_impulse(b, rbx, rby, jx, jy, 1.0)
      }
      if j_motor_on[j] && iia + iib > 0.0 {
        let wrel = av[b] - av[a]
        let max_j = j_motor_max[j] * h
        let jm = clamp((j_motor_speed[j] - wrel) / (iia + iib), -max_j, max_j)
        av[a] = av[a] - jm * iia
        av[b] = av[b] + jm * iib
      }
    } else {
      let dx = bx - ax
      let dy = by - ay
      let len = (dx * dx + dy * dy).sqrt()
      if len > 0.000001 {
        let nx = dx / len
        let ny = dy / len
        let ran = rax * ny - ray * nx
        let rbn = rbx * ny - rby * nx
        let k = ima + imb + ran * ran * iia + rbn * rbn * iib
        if k > 0.0 {
          let vn = rvx * nx + rvy * ny
          let lambda = -(vn + baumgarte / h * (len - j_len[j])) / k
          apply_impulse(a, rax, ray, nx, ny, -lambda)
          apply_impulse(b, rbx, rby, nx, ny, lambda)
        }
      }
    }
  }
}

///|
/// Advance the world by dt seconds in `substeps` substeps with `iterations` solver passes each.
pub fn step(dt : Double, substeps : Int, iterations : Int) -> Unit {
  let n = if substeps < 1 { 1 } else { substeps }
  let h = dt / n.to_double()
  for s = 0; s < n; s = s + 1 {
    for i = 0; i < kind.length(); i = i + 1 {
      if kind[i] == 1 {
        vx[i] = vx[i] + gravity[0] * gravity_scale[i] * h
        vy[i] = vy[i] + gravity[1] * gravity_scale[i] * h
        let ld = 1.0 / (1.0 + lin_damp[i] * h)
        vx[i] = vx[i] * ld
        vy[i] = vy[i] * ld
        av[i] = av[i] / (1.0 + ang_damp[i] * h)
      }
    }
    detect(s == n - 1)
    prepare_contacts(h)
    for it = 0; it < iterations; it = it + 1 {
      solve_joints(h)
      solve_contacts()
    }
    store_warm_start()
    for i = 0; i < kind.length(); i = i + 1 {
      if kind[i] == 1 || kind[i] == 2 {
        px[i] = px[i] + vx[i] * h
        py[i] = py[i] + vy[i] * h
        ang[i] = ang[i] + av[i] * h
      }
    }
  }
}
