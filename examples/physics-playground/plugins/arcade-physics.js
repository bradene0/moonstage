// Arcade physics: a small, dependency-free reference physics provider.
//
// It implements Moonstage's physics contract (docs/physics.md) well enough for
// arcade games and for testing the provider boundary. It is not a
// general-purpose engine: boxes stay axis-aligned for collision, collisions
// apply no torque, and broad-phase is O(n²). For serious physics, write a
// provider around an engine such as Rapier against the same contract.
//
// Contract summary:
//   components physicsBody / collider / joint, manifest physics.gravity
//   state vx, vy, av   velocity, read and written every tick (behaviors may set them)
//   events            "collision" / "collisionEnd", once per entity in the pair,
//                     source = that entity, value = the other entity's handle

const EPSILON = 1e-9;
/** Below this approach speed (px/s) contacts don't bounce, so resting bodies settle. */
const REST_SPEED = 30;

/** @type {import("@moonstage/core").MoonstagePlugin<{ substeps?: number }>} */
export default {
  name: "arcade-physics",
  version: "0.1.0",
  pluginApi: 3,
  provides: ["physics"],
  capabilities: ["world.read", "world.write", "events"],
  description: "Reference physics provider: circles and axis-aligned boxes, restitution, friction, sensors, pin and distance joints.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: { substeps: { type: "integer", minimum: 1, maximum: 16, description: "Solver substeps per tick (default 4)." } },
  },
  create(ctx, config) {
    const substeps = config.substeps ?? 4;
    const gravity = ctx.project.physics?.gravity ?? [0, 980];
    /** @type {Map<string, Body>} */
    const bodies = new Map();
    /** @type {Joint[]} */
    let joints = [];
    /** Pair keys "a|b" touching at the end of the previous tick. */
    let touching = new Set();

    function add(id) {
      const body = makeBody(ctx, id);
      if (body !== undefined) bodies.set(id, body);
    }
    function rebuildJoints() {
      joints = [];
      for (const id of bodies.keys()) {
        const spec = ctx.world.component(id, "joint");
        if (spec === undefined || !bodies.has(String(spec.target))) continue;
        joints.push(makeJoint(bodies.get(id), bodies.get(String(spec.target)), spec));
      }
    }

    return {
      start() {
        for (const id of ctx.world.entities()) add(id);
        rebuildJoints();
      },
      entityAdded(id) {
        add(id);
        if (ctx.world.component(id, "joint") !== undefined) rebuildJoints();
      },
      entityRemoved(id) {
        if (!bodies.delete(id)) return;
        joints = joints.filter((j) => j.a.id !== id && j.b.id !== id);
        for (const key of touching) if (key.split("|").includes(id)) touching.delete(key);
      },
      update(dt) {
        const list = [...bodies.values()].filter((b) => ctx.world.active(b.id));
        for (const b of list) syncIn(ctx, b, dt);
        const h = dt / substeps;
        const now = new Set();
        for (let step = 0; step < substeps; step++) {
          for (const b of list) integrate(b, gravity, h);
          for (let i = 0; i < list.length; i++) {
            for (let k = i + 1; k < list.length; k++) {
              const a = list[i];
              const b = list[k];
              if (a.invMass === 0 && b.invMass === 0 && !a.sensor && !b.sensor) continue;
              const contact = collide(a, b);
              if (contact === undefined) continue;
              now.add(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
              if (!a.sensor && !b.sensor) resolve(a, b, contact);
            }
          }
          for (const j of joints) solveJoint(j);
        }
        for (const b of list) syncOut(ctx, b);
        for (const key of now) if (!touching.has(key)) emitPair(ctx, "collision", key);
        for (const key of touching) if (!now.has(key) && bodies.has(key.split("|")[0]) && bodies.has(key.split("|")[1])) emitPair(ctx, "collisionEnd", key);
        touching = now;
      },
      stop() {
        bodies.clear();
        joints = [];
        touching = new Set();
      },
    };
  },
};

/**
 * @typedef {{ id: string, kind: "dynamic" | "static" | "kinematic", x: number, y: number, angle: number,
 *   vx: number, vy: number, av: number, invMass: number, shape: "circle" | "box", r: number, hw: number, hh: number,
 *   ox: number, oy: number, friction: number, restitution: number, sensor: boolean, gravityScale: number,
 *   damping: number, angularDamping: number, fixedRotation: boolean, written: { x: number, y: number, angle: number, vx: number, vy: number, av: number } }} Body
 * @typedef {{ a: Body, b: Body, ax: number, ay: number, bx: number, by: number, length: number, motorSpeed: number | undefined }} Joint
 */

/** @returns {Body | undefined} */
function makeBody(ctx, id) {
  const spec = ctx.world.component(id, "physicsBody");
  const collider = ctx.world.component(id, "collider");
  if (spec === undefined && collider === undefined) return undefined;
  const t = ctx.world.transform(id);
  const kind = spec === undefined ? "static" : (spec.type ?? "dynamic");
  const shape = collider?.shape === "circle" ? "circle" : "box";
  let hw = 8;
  let hh = 8;
  if (collider?.shape === "box" && Array.isArray(collider.size)) [hw, hh] = [collider.size[0] / 2, collider.size[1] / 2];
  if (collider?.shape === "polygon" && Array.isArray(collider.points)) {
    // Polygons collide as their bounding box in this reference provider.
    const xs = collider.points.map((p) => p[0]);
    const ys = collider.points.map((p) => p[1]);
    hw = (Math.max(...xs) - Math.min(...xs)) / 2;
    hh = (Math.max(...ys) - Math.min(...ys)) / 2;
  }
  const r = Number(collider?.radius ?? 8);
  const area = shape === "circle" ? Math.PI * r * r : 4 * hw * hh;
  const mass = Number(spec?.mass ?? (Number(collider?.density ?? 1) * area) / 100);
  const velocity = Array.isArray(spec?.velocity) ? spec.velocity : [0, 0];
  const body = {
    id,
    kind,
    x: t.x,
    y: t.y,
    angle: t.rotation,
    vx: kind === "static" ? 0 : Number(velocity[0]),
    vy: kind === "static" ? 0 : Number(velocity[1]),
    av: kind === "static" ? 0 : Number(spec?.angularVelocity ?? 0),
    invMass: kind === "dynamic" ? 1 / mass : 0,
    shape,
    r,
    hw,
    hh,
    ox: Array.isArray(collider?.offset) ? collider.offset[0] : 0,
    oy: Array.isArray(collider?.offset) ? collider.offset[1] : 0,
    friction: Number(collider?.friction ?? 0.3),
    restitution: Number(collider?.restitution ?? 0),
    sensor: collider?.sensor === true,
    gravityScale: Number(spec?.gravityScale ?? 1),
    damping: Number(spec?.linearDamping ?? 0),
    angularDamping: Number(spec?.angularDamping ?? 0),
    fixedRotation: spec?.fixedRotation === true,
    written: { x: NaN, y: NaN, angle: NaN, vx: NaN, vy: NaN, av: NaN },
  };
  if (kind !== "static") {
    // Behaviors may set initial velocity through state as well.
    body.vx = stateOr(ctx, id, "vx", body.vx);
    body.vy = stateOr(ctx, id, "vy", body.vy);
    body.av = stateOr(ctx, id, "av", body.av);
  }
  return body;
}

function stateOr(ctx, id, key, fallback) {
  const v = ctx.world.state(id, key);
  return v === 0 ? fallback : v;
}

/** Take changes behaviors made since our last write: teleports and velocity edits. */
function syncIn(ctx, b, dt) {
  const t = ctx.world.transform(b.id);
  if (b.kind === "kinematic") {
    // Kinematic bodies follow their transform; derive velocity so contacts push correctly.
    if (!Number.isNaN(b.written.x)) {
      b.vx = (t.x - b.written.x) / dt;
      b.vy = (t.y - b.written.y) / dt;
    }
    b.x = t.x;
    b.y = t.y;
    b.angle = t.rotation;
    return;
  }
  if (t.x !== b.written.x || t.y !== b.written.y) {
    b.x = t.x;
    b.y = t.y;
  }
  if (t.rotation !== b.written.angle) b.angle = t.rotation;
  if (b.kind !== "dynamic") return;
  const vx = ctx.world.state(b.id, "vx");
  const vy = ctx.world.state(b.id, "vy");
  const av = ctx.world.state(b.id, "av");
  if (!Number.isNaN(b.written.vx) && vx !== b.written.vx) b.vx = vx;
  if (!Number.isNaN(b.written.vy) && vy !== b.written.vy) b.vy = vy;
  if (!Number.isNaN(b.written.av) && av !== b.written.av) b.av = av;
}

function syncOut(ctx, b) {
  if (b.kind === "static") {
    b.written = { x: b.x, y: b.y, angle: b.angle, vx: 0, vy: 0, av: 0 };
    return;
  }
  if (b.kind === "dynamic") {
    ctx.world.setTransform(b.id, { x: b.x, y: b.y, rotation: b.angle });
  }
  ctx.world.setState(b.id, "vx", b.vx);
  ctx.world.setState(b.id, "vy", b.vy);
  ctx.world.setState(b.id, "av", b.av);
  b.written = { x: b.x, y: b.y, angle: b.angle, vx: b.vx, vy: b.vy, av: b.av };
}

function integrate(b, gravity, h) {
  if (b.kind !== "dynamic") return;
  b.vx += gravity[0] * b.gravityScale * h;
  b.vy += gravity[1] * b.gravityScale * h;
  const damp = 1 / (1 + b.damping * h);
  b.vx *= damp;
  b.vy *= damp;
  b.x += b.vx * h;
  b.y += b.vy * h;
  if (!b.fixedRotation) {
    b.av *= 1 / (1 + b.angularDamping * h);
    b.angle += b.av * h;
  }
}

/** Contact normal (from a to b) and penetration depth, or undefined. */
function collide(a, b) {
  const ax = a.x + a.ox;
  const ay = a.y + a.oy;
  const bx = b.x + b.ox;
  const by = b.y + b.oy;
  if (a.shape === "circle" && b.shape === "circle") {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const depth = a.r + b.r - dist;
    if (depth <= 0) return undefined;
    return dist < EPSILON ? { nx: 0, ny: 1, depth } : { nx: dx / dist, ny: dy / dist, depth };
  }
  if (a.shape === "box" && b.shape === "box") {
    const dx = bx - ax;
    const dy = by - ay;
    const px = a.hw + b.hw - Math.abs(dx);
    const py = a.hh + b.hh - Math.abs(dy);
    if (px <= 0 || py <= 0) return undefined;
    return px < py ? { nx: Math.sign(dx) || 1, ny: 0, depth: px } : { nx: 0, ny: Math.sign(dy) || 1, depth: py };
  }
  // Circle against box; flip so the circle is first, then flip the normal back.
  const circleFirst = a.shape === "circle";
  const [cx, cy, c] = circleFirst ? [ax, ay, a] : [bx, by, b];
  const [qx, qy, q] = circleFirst ? [bx, by, b] : [ax, ay, a];
  const closestX = Math.max(qx - q.hw, Math.min(cx, qx + q.hw));
  const closestY = Math.max(qy - q.hh, Math.min(cy, qy + q.hh));
  let nx = closestX - cx;
  let ny = closestY - cy;
  let dist = Math.hypot(nx, ny);
  let depth;
  if (dist < EPSILON) {
    // Center inside the box: push out along the shallowest axis.
    const px = q.hw - Math.abs(cx - qx);
    const py = q.hh - Math.abs(cy - qy);
    [nx, ny] = px < py ? [Math.sign(qx - cx) || 1, 0] : [0, Math.sign(qy - cy) || 1];
    depth = Math.min(px, py) + c.r;
    dist = 1;
  } else {
    depth = c.r - dist;
    if (depth <= 0) return undefined;
    nx /= dist;
    ny /= dist;
  }
  return circleFirst ? { nx, ny, depth } : { nx: -nx, ny: -ny, depth };
}

function resolve(a, b, { nx, ny, depth }) {
  const total = a.invMass + b.invMass;
  if (total === 0) return;
  // Positional correction, leaving a little slop to avoid jitter.
  const correction = Math.max(depth - 0.01, 0) / total;
  a.x -= nx * correction * a.invMass;
  a.y -= ny * correction * a.invMass;
  b.x += nx * correction * b.invMass;
  b.y += ny * correction * b.invMass;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const e = -vn < REST_SPEED ? 0 : Math.max(a.restitution, b.restitution);
  const j = (-(1 + e) * vn) / total;
  a.vx -= j * nx * a.invMass;
  a.vy -= j * ny * a.invMass;
  b.vx += j * nx * b.invMass;
  b.vy += j * ny * b.invMass;

  // Coulomb friction along the tangent, clamped by the normal impulse.
  let tx = rvx - vn * nx;
  let ty = rvy - vn * ny;
  const tl = Math.hypot(tx, ty);
  if (tl < EPSILON) return;
  tx /= tl;
  ty /= tl;
  const mu = Math.sqrt(a.friction * b.friction);
  const jt = Math.max(-j * mu, Math.min(j * mu, -(rvx * tx + rvy * ty) / total));
  a.vx -= jt * tx * a.invMass;
  a.vy -= jt * ty * a.invMass;
  b.vx += jt * tx * b.invMass;
  b.vy += jt * ty * b.invMass;
}

function anchorPoint(body, lx, ly) {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return [body.x + lx * cos - ly * sin, body.y + lx * sin + ly * cos];
}

/** @returns {Joint} */
function makeJoint(a, b, spec) {
  const [ax, ay] = Array.isArray(spec.anchor) ? spec.anchor : [0, 0];
  const [bx, by] = Array.isArray(spec.targetAnchor) ? spec.targetAnchor : [0, 0];
  const [pax, pay] = anchorPoint(a, ax, ay);
  const [pbx, pby] = anchorPoint(b, bx, by);
  // "revolute" and "weld" pin the anchors together (length 0); this provider has no angular constraints.
  const length = spec.type === "distance" ? Number(spec.length ?? Math.hypot(pbx - pax, pby - pay)) : 0;
  return { a, b, ax, ay, bx, by, length, motorSpeed: spec.type === "revolute" ? spec.motorSpeed : undefined };
}

function solveJoint(j) {
  const { a, b } = j;
  const total = a.invMass + b.invMass;
  if (total > 0) {
    const [pax, pay] = anchorPoint(a, j.ax, j.ay);
    const [pbx, pby] = anchorPoint(b, j.bx, j.by);
    const dx = pbx - pax;
    const dy = pby - pay;
    const dist = Math.hypot(dx, dy);
    const error = dist - j.length;
    if (Math.abs(error) > EPSILON) {
      const [nx, ny] = dist < EPSILON ? [0, 0] : [dx / dist, dy / dist];
      const push = error / total;
      a.x += nx * push * a.invMass;
      a.y += ny * push * a.invMass;
      b.x -= nx * push * b.invMass;
      b.y -= ny * push * b.invMass;
      // Remove relative velocity along the joint axis.
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      a.vx += nx * vn * (a.invMass / total);
      a.vy += ny * vn * (a.invMass / total);
      b.vx -= nx * vn * (b.invMass / total);
      b.vy -= ny * vn * (b.invMass / total);
    }
  }
  if (j.motorSpeed !== undefined) b.av = j.motorSpeed;
}

function emitPair(ctx, event, key) {
  const [a, b] = key.split("|");
  ctx.events.emit(event, ctx.world.handle(b), a);
  ctx.events.emit(event, ctx.world.handle(a), b);
}
