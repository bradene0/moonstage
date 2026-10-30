/**
 * @moonstage/physics: rigid-body physics provider for Moonstage.
 *
 * The engine (moonbit/engine/engine.mbt) is written in MoonBit and compiled
 * to WebAssembly; the build embeds that WebAssembly into this module as
 * base64, so the plugin is a single self-contained file that works in
 * bundles, .msp packages and single-file games, in browsers and in Node.
 *
 * It implements the provider contract in docs/physics.md:
 *   components physicsBody / collider / joint, manifest physics.gravity
 *   state vx, vy, av    velocity, read and written every tick
 *   events             "collision" / "collisionEnd" once per entity in a pair,
 *                      source = that entity, value = the other entity's handle
 *
 * Unlike the arcade reference provider, bodies rotate: boxes collide as
 * oriented boxes, contacts apply torque, circles roll, and revolute joints
 * (with motors) pin bodies together. Polygons collide as their bounding box.
 */

import type { MoonstagePlugin, PluginContext, TilemapComponent } from "@moonstage/core";

/** Replaced with the engine's WebAssembly (base64) by scripts/build-physics.mjs. */
const ENGINE_WASM = "__MOONSTAGE_PHYSICS_ENGINE__";

export const PLUGIN_NAME = "@moonstage/physics";

interface Engine {
  reset(): void;
  set_gravity(x: number, y: number): void;
  add_body(kind: number, shape: number, a: number, b: number): number;
  remove_body(i: number): void;
  set_mass(i: number, mass: number, density: number, fixedRotation: number): void;
  set_material(i: number, friction: number, restitution: number, sensor: number): void;
  set_motion(i: number, gravityScale: number, linear: number, angular: number): void;
  set_offset(i: number, x: number, y: number): void;
  set_pose(i: number, x: number, y: number, angle: number): void;
  set_velocity(i: number, x: number, y: number, angular: number): void;
  body_x(i: number): number;
  body_y(i: number): number;
  body_angle(i: number): number;
  body_vx(i: number): number;
  body_vy(i: number): number;
  body_av(i: number): number;
  add_joint(kind: number, a: number, b: number, ax: number, ay: number, bx: number, by: number, length: number): number;
  set_motor(j: number, speed: number, maxTorque: number): void;
  remove_joint(j: number): void;
  step(dt: number, substeps: number, iterations: number): void;
  contact_count(): number;
  contact_a(k: number): number;
  contact_b(k: number): number;
}

interface Body {
  id: string;
  index: number;
  kind: "dynamic" | "static" | "kinematic";
  written: { x: number; y: number; angle: number; vx: number; vy: number; av: number };
}

interface WasmApi {
  compile(bytes: Uint8Array): Promise<object>;
  Instance: new (module: object, imports: object) => { exports: Record<string, unknown> };
}

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === "function") return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return new Uint8Array((globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }).Buffer!.from(text, "base64"));
}

const KIND = { static: 0, dynamic: 1, kinematic: 2 } as const;

type Vec2 = [number, number];
const vec2 = (v: unknown): Vec2 | undefined =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number") ? [v[0] as number, v[1] as number] : undefined;

export function createPhysicsPlugin(): MoonstagePlugin<{ substeps?: number; iterations?: number }> {
  let compiled: object | undefined;
  const wasm = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly;

  return {
    name: PLUGIN_NAME,
    version: "0.0.0",
    pluginApi: 4,
    provides: ["physics"],
    capabilities: ["world.read", "world.write", "events"],
    description: "Rigid-body physics with rotation, friction, restitution, sensors and joints (MoonBit engine).",
    configSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        substeps: { type: "integer", minimum: 1, maximum: 16, description: "Solver substeps per tick (default 4)." },
        iterations: { type: "integer", minimum: 1, maximum: 40, description: "Solver iterations per substep (default 8)." },
      },
    },

    async load() {
      compiled ??= await wasm.compile(decodeBase64(ENGINE_WASM));
    },

    create(ctx: PluginContext, config) {
      // One engine instance per runtime, so worlds never share state.
      const engine = new wasm.Instance(compiled!, {}).exports as unknown as Engine;
      engine.reset();
      const gravity = ctx.project.physics?.gravity ?? [0, 980];
      engine.set_gravity(gravity[0], gravity[1]);
      const substeps = config.substeps ?? 4;
      const iterations = config.iterations ?? 8;
      const bodies = new Map<string, Body>();
      const byIndex = new Map<number, Body>();
      const joints = new Map<string, number>();
      let touching = new Set<string>();

      const tileBodies = new Map<string, number[]>();

      /** Each row's consecutive solid tiles as one rectangle, in the map's local pixels. */
      const solidRuns = (map: TilemapComponent) => {
        const [tw, th] = map.tileSize;
        const runs: { x: number; y: number; width: number; height: number }[] = [];
        map.rows.forEach((row, r) => {
          let start = -1;
          for (let c = 0; c <= row.length; c++) {
            const solid = c < row.length && map.tiles[row[c]!]?.solid === true;
            if (solid && start < 0) start = c;
            if (!solid && start >= 0) {
              runs.push({ x: start * tw, y: r * th, width: (c - start) * tw, height: th });
              start = -1;
            }
          }
        });
        return runs;
      };

      // A tilemap's solid tiles become static boxes, one per run of solid tiles in a row. Contacts with
      // them report the tilemap entity.
      const addTiles = (id: string) => {
        const map = ctx.world.component(id, "tilemap") as TilemapComponent | undefined;
        if (map === undefined || tileBodies.has(id)) return;
        const t = ctx.world.transform(id);
        const indices = solidRuns(map).map((run) => {
          const index = engine.add_body(KIND.static, 1, run.width, run.height);
          engine.set_material(index, 0.3, 0, 0);
          engine.set_pose(index, t.x + run.x + run.width / 2, t.y + run.y + run.height / 2, 0);
          byIndex.set(index, { id, index, kind: "static", written: { x: NaN, y: NaN, angle: NaN, vx: NaN, vy: NaN, av: NaN } });
          return index;
        });
        tileBodies.set(id, indices);
      };

      const add = (id: string) => {
        addTiles(id);
        if (bodies.has(id)) return;
        const spec = ctx.world.component(id, "physicsBody");
        const collider = ctx.world.component(id, "collider");
        if (spec === undefined && collider === undefined) return;
        const kind = spec === undefined ? "static" : ((spec.type as Body["kind"] | undefined) ?? "dynamic");
        let shape = 1;
        let a = 16;
        let b = 16;
        if (collider?.shape === "circle") {
          shape = 0;
          a = Number(collider.radius ?? 8);
        } else if (collider?.shape === "box") {
          [a, b] = vec2(collider.size) ?? [16, 16];
        } else if (collider?.shape === "polygon" && Array.isArray(collider.points)) {
          const points = collider.points as Vec2[];
          const xs = points.map((p) => p[0]);
          const ys = points.map((p) => p[1]);
          a = Math.max(...xs) - Math.min(...xs);
          b = Math.max(...ys) - Math.min(...ys);
        }
        const index = engine.add_body(KIND[kind], shape, a, b);
        engine.set_mass(index, Number(spec?.mass ?? 0), Number(collider?.density ?? 1), spec?.fixedRotation === true ? 1 : 0);
        engine.set_material(index, Number(collider?.friction ?? 0.3), Number(collider?.restitution ?? 0), collider?.sensor === true ? 1 : 0);
        engine.set_motion(index, Number(spec?.gravityScale ?? 1), Number(spec?.linearDamping ?? 0), Number(spec?.angularDamping ?? 0));
        const offset = vec2(collider?.offset);
        if (offset) engine.set_offset(index, offset[0], offset[1]);
        const t = ctx.world.transform(id);
        engine.set_pose(index, t.x, t.y, t.rotation);
        if (kind !== "static") {
          const v = vec2(spec?.velocity) ?? [0, 0];
          const state = (key: string, fallback: number) => ctx.world.state(id, key) || fallback;
          engine.set_velocity(index, state("vx", v[0]), state("vy", v[1]), state("av", Number(spec?.angularVelocity ?? 0)));
        }
        const body: Body = { id, index, kind, written: { x: NaN, y: NaN, angle: NaN, vx: NaN, vy: NaN, av: NaN } };
        bodies.set(id, body);
        byIndex.set(index, body);
      };

      const connect = (id: string) => {
        const spec = ctx.world.component(id, "joint");
        const a = bodies.get(id);
        const b = spec !== undefined ? bodies.get(String(spec.target)) : undefined;
        if (spec === undefined || a === undefined || b === undefined || joints.has(id)) return;
        const [ax, ay] = vec2(spec.anchor) ?? [0, 0];
        const [bx, by] = vec2(spec.targetAnchor) ?? [0, 0];
        // revolute and weld pin the anchors together; distance keeps them `length` apart.
        const kind = spec.type === "distance" ? 0 : 1;
        const j = engine.add_joint(kind, a.index, b.index, ax, ay, bx, by, typeof spec.length === "number" ? spec.length : -1);
        if (spec.type === "revolute" && typeof spec.motorSpeed === "number") {
          engine.set_motor(j, spec.motorSpeed, Number(spec.maxMotorTorque ?? 1e9));
        }
        joints.set(id, j);
      };

      const release = (id: string) => {
        for (const index of tileBodies.get(id) ?? []) {
          engine.remove_body(index);
          byIndex.delete(index);
        }
        tileBodies.delete(id);
        const body = bodies.get(id);
        if (body === undefined) return;
        engine.remove_body(body.index); // also removes its joints in the engine
        bodies.delete(id);
        byIndex.delete(body.index);
        joints.delete(id);
        for (const key of touching) if (key.split("|").includes(id)) touching.delete(key);
      };

      const emitPair = (event: string, key: string) => {
        const [a, b] = key.split("|") as [string, string];
        ctx.events.emit(event, ctx.world.handle(b), a);
        ctx.events.emit(event, ctx.world.handle(a), b);
      };

      return {
        start() {
          for (const id of ctx.world.entities()) add(id);
          for (const id of [...bodies.keys()]) connect(id);
        },
        entityAdded(id) {
          add(id);
          connect(id);
        },
        entityRemoved: release,
        update(dt) {
          // Take what behaviors changed since our last write: teleports, rotations, velocities.
          for (const b of bodies.values()) {
            const t = ctx.world.transform(b.id);
            const w = b.written;
            if (b.kind === "kinematic") {
              const vx = Number.isNaN(w.x) ? 0 : (t.x - w.x) / dt;
              const vy = Number.isNaN(w.y) ? 0 : (t.y - w.y) / dt;
              const va = Number.isNaN(w.angle) ? 0 : (t.rotation - w.angle) / dt;
              engine.set_pose(b.index, t.x, t.y, t.rotation);
              engine.set_velocity(b.index, vx, vy, va);
              continue;
            }
            if (t.x !== w.x || t.y !== w.y || t.rotation !== w.angle) engine.set_pose(b.index, t.x, t.y, t.rotation);
            if (b.kind === "dynamic" && !Number.isNaN(w.vx)) {
              const vx = ctx.world.state(b.id, "vx");
              const vy = ctx.world.state(b.id, "vy");
              const av = ctx.world.state(b.id, "av");
              if (vx !== w.vx || vy !== w.vy || av !== w.av) {
                engine.set_velocity(
                  b.index,
                  vx !== w.vx ? vx : engine.body_vx(b.index),
                  vy !== w.vy ? vy : engine.body_vy(b.index),
                  av !== w.av ? av : engine.body_av(b.index),
                );
              }
            }
          }
          engine.step(dt, substeps, iterations);
          for (const b of bodies.values()) {
            const x = engine.body_x(b.index);
            const y = engine.body_y(b.index);
            const angle = engine.body_angle(b.index);
            if (b.kind === "dynamic") ctx.world.setTransform(b.id, { x, y, rotation: angle });
            const vx = engine.body_vx(b.index);
            const vy = engine.body_vy(b.index);
            const av = engine.body_av(b.index);
            if (b.kind !== "static") {
              ctx.world.setState(b.id, "vx", vx);
              ctx.world.setState(b.id, "vy", vy);
              ctx.world.setState(b.id, "av", av);
            }
            // A kinematic body's pose belongs to its behavior: remember the pose it was given, not the
            // engine's integrated one, or the next tick sees no motion and derives zero velocity.
            if (b.kind === "kinematic") {
              const t = ctx.world.transform(b.id);
              b.written = { x: t.x, y: t.y, angle: t.rotation, vx, vy, av };
            } else {
              b.written = { x, y, angle, vx, vy, av };
            }
          }
          const now = new Set<string>();
          for (let k = 0; k < engine.contact_count(); k++) {
            const a = byIndex.get(engine.contact_a(k));
            const b = byIndex.get(engine.contact_b(k));
            if (a === undefined || b === undefined) continue;
            now.add(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
          }
          for (const key of now) if (!touching.has(key)) emitPair("collision", key);
          for (const key of touching) if (!now.has(key)) emitPair("collisionEnd", key);
          touching = now;
        },
        stop() {
          engine.reset();
          bodies.clear();
          byIndex.clear();
          tileBodies.clear();
          joints.clear();
          touching = new Set();
        },
      };
    },
  };
}

export default createPhysicsPlugin();
