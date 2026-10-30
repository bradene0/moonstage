import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPluginConformance, Runtime, type EntitySource, type LoadedProject } from "@moonstage/core";
import plugin, { PLUGIN_NAME } from "./index.js";

function world(entities: EntitySource[], extra: Partial<LoadedProject["manifest"]> = {}): LoadedProject {
  return {
    manifest: {
      format: 1,
      name: "physics-test",
      entryScene: "main",
      scenes: { main: "main.json" },
      physics: { gravity: [0, 900] },
      plugins: { [PLUGIN_NAME]: { module: PLUGIN_NAME } },
      ...extra,
    },
    scenes: { main: { format: 1, entities } },
    behaviors: {},
    plugins: { [PLUGIN_NAME]: plugin },
  };
}

const ground: EntitySource = { id: "ground", components: { transform: { position: [0, 500] }, collider: { shape: "box", size: [2000, 40] } } };
const box = (id: string, x: number, y: number, rotation = 0, extra = {}): EntitySource => ({
  id,
  components: { transform: { position: [x, y], rotation }, physicsBody: {}, collider: { shape: "box", size: [40, 40], ...extra } },
});

async function simulate(project: LoadedProject, ticks: number) {
  const rt = await Runtime.create(project);
  for (let i = 0; i < ticks; i++) rt.step();
  return rt;
}

describe("@moonstage/physics", () => {
  it("passes the plugin conformance suite", async () => {
    const report = await checkPluginConformance(plugin);
    assert.equal(report.passed, true, JSON.stringify(report.checks.filter((c) => !c.passed)));
  });

  it("settles a tilted box flat on the ground", async () => {
    const rt = await simulate(world([ground, box("crate", 0, 300, 0.4)]), 240);
    assert.ok(Math.abs((rt.read("crate", "transform.position.y") as number) - 460) < 1.5);
    assert.ok(Math.abs(rt.read("crate", "transform.rotation") as number) < 0.05, "rotated to rest on a face");
    assert.ok(Math.abs(rt.read("crate", "state.vy") as number) < 1);
  });

  it("rolls circles down slopes and tumbles boxes off ledges", async () => {
    const ramp: EntitySource = {
      id: "ramp",
      components: { transform: { position: [0, 500], rotation: 0.35 }, collider: { shape: "box", size: [2000, 40], friction: 0.8 } },
    };
    const ball: EntitySource = {
      id: "ball",
      components: { transform: { position: [-300, 350] }, physicsBody: {}, collider: { shape: "circle", radius: 20, friction: 0.8 } },
    };
    let rt = await simulate(world([ramp, ball]), 120);
    const v = rt.read("ball", "state.vx") as number;
    const spin = rt.read("ball", "state.av") as number;
    assert.ok(v > 100 && Math.abs(spin * 20 - v) / v < 0.2, `rolls without slipping (v=${v}, ωr=${spin * 20})`);

    const ledge: EntitySource = { id: "ledge", components: { transform: { position: [0, 500] }, collider: { shape: "box", size: [200, 40] } } };
    rt = await simulate(world([ledge, box("crate", 118, 460)]), 60);
    assert.ok((rt.read("crate", "transform.rotation") as number) > 0.5, "an overhanging box tips over the edge");
  });

  it("reports collisions, honors sensors, joints and behavior-set velocity", async () => {
    const sensor: EntitySource = {
      id: "zone",
      components: { transform: { position: [0, 320] }, collider: { shape: "box", size: [100, 60], sensor: true } },
    };
    const a = box("a", 0, 200);
    const b: EntitySource = { ...box("b", 60, 200), components: { ...box("b", 60, 200).components, joint: { type: "distance", target: "a" } } };
    const rt = await simulate(world([ground, sensor, a, b]), 120);
    const names = rt.events.map((e) => `${e.name}:${e.source}`);
    assert.ok(names.includes("collision:zone") && names.includes("collision:a"), names.join(","));
    assert.ok(names.includes("collisionEnd:zone"), "falling through the sensor ends the overlap");
    const dx = (rt.read("b", "transform.position.x") as number) - (rt.read("a", "transform.position.x") as number);
    const dy = (rt.read("b", "transform.position.y") as number) - (rt.read("a", "transform.position.y") as number);
    assert.ok(Math.abs(Math.hypot(dx, dy) - 60) < 1, "distance joint holds");

    // A behavior writing state vx drives the body; the joint shares the momentum with b.
    rt.world.byStableId("a")!.state.set("vx", 300);
    rt.step();
    const va = rt.read("a", "state.vx") as number;
    const vb = rt.read("b", "state.vx") as number;
    assert.ok(va > 100 && vb > 100 && va + vb < 300, `momentum shared through the joint (a=${va}, b=${vb})`);
  });

  it("keeps a post-and-plank tower standing for minutes, and wakes it when hit", async () => {
    const platform: EntitySource = { id: "platform", components: { transform: { position: [600, 420] }, collider: { shape: "box", size: [300, 30] } } };
    const blocks: EntitySource[] = [];
    let y = 405;
    for (let floor = 0; floor < 3; floor++) {
      for (const x of [560, 640]) {
        blocks.push({ id: `post-${floor}-${x}`, components: { transform: { position: [x, y - 40] }, physicsBody: {}, collider: { shape: "box", size: [16, 80], friction: 0.6 } } });
      }
      blocks.push({ id: `plank-${floor}`, components: { transform: { position: [600, y - 88] }, physicsBody: {}, collider: { shape: "box", size: [120, 16], friction: 0.6 } } });
      y -= 96;
    }
    const project = world([platform, ...blocks]);
    const rt = await Runtime.create(project);
    const start = new Map(rt.world.entities.map((e) => [e.id, { ...e.transform }]));
    for (let i = 0; i < 180 * 60; i++) rt.step();
    let drift = 0;
    for (const b of blocks) {
      const now = rt.world.byStableId(b.id)!.transform;
      const was = start.get(b.id)!;
      drift = Math.max(drift, Math.hypot(now.x - was.x, now.y - was.y));
    }
    assert.ok(drift < 2, `untouched tower drifted ${drift.toFixed(2)} px in 180 s`);

    // Resting blocks sleep; knocking out a bottom post must wake the stack above it.
    const plankY = rt.read("plank-0", "transform.position.y") as number;
    rt.world.byStableId("post-0-560")!.state.set("vx", 800);
    for (let i = 0; i < 120; i++) rt.step();
    const fell = (rt.read("plank-0", "transform.position.y") as number) - plankY;
    assert.ok(fell > 10, `the plank above a knocked-out post falls (moved ${fell.toFixed(1)} px)`);
  });

  it("keeps resting bodies awake while something slow moves them", async () => {
    const lift: EntitySource = {
      id: "lift",
      components: { transform: { position: [0, 400] }, physicsBody: { type: "kinematic" }, collider: { shape: "box", size: [300, 20], friction: 0.9 } },
    };
    const crate = box("crate", 0, 370, 0, { friction: 0.9 });
    const rt = await simulate(world([lift, crate]), 120);
    const start = rt.read("crate", "transform.position.x") as number;
    // Slower than the sleep threshold, so the crate only follows if the moving platform wakes it.
    for (let i = 0; i < 600; i++) {
      rt.world.byStableId("lift")!.transform.x += 0.02;
      rt.step();
    }
    const moved = (rt.read("crate", "transform.position.x") as number) - start;
    assert.ok(Math.abs(moved - 12) < 1, `the crate rides the slow platform (moved ${moved.toFixed(2)} px of 12)`);
  });

  it("is deterministic and isolates worlds", async () => {
    const make = () => world([ground, box("c1", 0, 100, 0.3), box("c2", 10, 0, 0.8), box("c3", -15, -100, 1.2)]);
    const [one, two] = await Promise.all([simulate(make(), 180), simulate(make(), 180)]);
    assert.deepEqual(one.snapshot(), two.snapshot());
  });
});
