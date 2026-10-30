import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MoonstageError } from "./diagnostics.js";
import { definePlugin, type PluginContext } from "./plugin.js";
import type { SceneSource } from "./project.js";
import { Runtime } from "./runtime.js";
import { runTest } from "./testing.js";
import { jsBehavior, manifest, minimalWasm, project } from "./test-helpers.test.js";

const moverManifest = manifest({
  input: { axes: { moveX: { negative: ["ArrowLeft"], positive: ["ArrowRight"] } } },
  behaviors: {
    mover: { wasm: "mover.wasm", params: ["speed"], state: ["hits"], refs: ["target"], inputs: ["moveX"], events: ["bump"] },
  },
});

const moverScene: SceneSource = {
  format: 1,
  entities: [
    {
      id: "player",
      components: {
        transform: { position: [0, 0] },
        behavior: { module: "mover", params: { speed: 60 }, refs: { target: "goal" } },
      },
    },
    { id: "goal", components: { transform: { position: [10, 0] } } },
  ],
};

/** Moves along x by input*speed; emits "bump" once per tick when within 1px of its target; counts bumps. */
const mover = jsBehavior((h) => ({
  ms_update(self, dt) {
    h.transform_set(self, 0, h.transform_get(self, 0) + h.input(0) * h.param(0) * dt);
    const target = h.ref(0);
    if (target >= 0 && Math.abs(h.transform_get(self, 0) - h.transform_get(target, 0)) < 1) h.emit(0, 2);
  },
  ms_event(self, event, _source, value) {
    if (event === 0) h.state_set(self, 0, h.state_get(self, 0) + value);
  },
}));

const moverProject = () => project(moverScene, { manifest: moverManifest, behaviors: { mover } });

describe("runtime", () => {
  it("runs behaviors at a fixed timestep with params, refs, input and events", async () => {
    const rt = await Runtime.create(moverProject());
    rt.input.set("moveX", 1);
    for (let i = 0; i < 10; i++) rt.step();
    assert.equal(rt.tick, 10);
    assert.ok(Math.abs((rt.read("player", "transform.position.x") as number) - 10) < 1e-9);
    assert.equal(rt.events.filter((e) => e.name === "bump").length >= 1, true);
    assert.equal(rt.events[0]!.source, "player");
    assert.equal(rt.read("player", "state.hits"), 2 * rt.events.length);
  });

  it("advance() runs whole ticks and returns the interpolation factor", async () => {
    const rt = await Runtime.create(moverProject());
    const alpha = rt.advance(2.5 / 60);
    assert.equal(rt.tick, 2);
    assert.ok(Math.abs(alpha - 0.5) < 1e-9);
    rt.advance(10); // a long stall is clamped
    assert.equal(rt.tick, 7);
  });

  it("converts behavior traps into MS3004 and disables only that binding", async () => {
    const boom = jsBehavior(() => ({ ms_update: () => { throw new Error("unreachable executed"); } }));
    const rt = await Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: boom } }));
    rt.step();
    rt.step();
    assert.equal(rt.diagnostics.length, 1);
    assert.equal(rt.diagnostics[0]!.code, "MS3004");
    assert.equal(rt.diagnostics[0]!.entity, "player");
  });

  it("rejects behaviors with the wrong ABI or missing exports", async () => {
    await assert.rejects(
      Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: jsBehavior(() => ({}), 99) } })),
      (err: MoonstageError) => err.diagnostics[0]!.code === "MS3002",
    );
    const partial = () => ({ ms_abi_version: () => 1 }) as never;
    await assert.rejects(
      Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: partial } })),
      (err: MoonstageError) => err.diagnostics[0]!.code === "MS3003",
    );
    await assert.rejects(
      Runtime.create(project(moverScene, { manifest: moverManifest })),
      (err: MoonstageError) => err.diagnostics[0]!.code === "MS3001",
    );
  });

  it("instantiates real WebAssembly behaviors", async () => {
    const rt = await Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: minimalWasm() } }));
    rt.step();
    assert.equal(rt.diagnostics.length, 0);
    await assert.rejects(
      Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: minimalWasm(4) } })),
      (err: MoonstageError) => err.diagnostics[0]!.code === "MS3002",
    );
    // Older modules keep working: each ABI version only added imports.
    await Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: minimalWasm(1) } }));
    await assert.rejects(
      Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: new Uint8Array([1, 2, 3]) } })),
      (err: MoonstageError) => err.diagnostics[0]!.code === "MS3007",
    );
  });

  it("is deterministic for a given seed", async () => {
    const rolls = jsBehavior((h) => ({ ms_update: (self) => h.transform_set(self, 1, h.random()) }));
    const run = async (seed: number) => {
      const rt = await Runtime.create(project(moverScene, { manifest: moverManifest, behaviors: { mover: rolls } }), { seed });
      for (let i = 0; i < 5; i++) rt.step();
      return rt.snapshot();
    };
    assert.deepEqual(await run(42), await run(42));
    assert.notDeepEqual(await run(42), await run(43));
  });

  it("skips inactive entities and their descendants", async () => {
    const scene: SceneSource = {
      format: 1,
      entities: [
        { id: "parent", active: false },
        { id: "player", parent: "parent", components: { behavior: { module: "mover", params: { speed: 60 } } } },
      ],
    };
    const rt = await Runtime.create(project(scene, { manifest: moverManifest, behaviors: { mover } }));
    rt.input.set("moveX", 1);
    rt.step();
    assert.equal(rt.read("player", "transform.position.x"), 0);
  });
});

describe("render frame", () => {
  const scene: SceneSource = {
    format: 1,
    camera: "cam",
    entities: [
      { id: "cam", components: { transform: { position: [100, 50] }, camera: { zoom: 2 } } },
      { id: "box", components: { transform: { position: [100, 50] }, shape: { kind: "rect", size: [10, 10], layer: 1 } } },
      { id: "child", parent: "box", components: { transform: { position: [5, 0] }, shape: { kind: "circle", radius: 2 } } },
      { id: "hidden", active: false, components: { shape: { kind: "circle" } } },
      { id: "hud", components: { transform: { position: [8, 16] }, text: { value: "HP {stats.hp}", space: "screen" } } },
      { id: "stats", components: { behavior: { module: "s", state: { hp: 3 } } } },
    ],
  };
  const m = manifest({ display: { width: 200, height: 100 }, behaviors: { s: { wasm: "s.wasm", state: ["hp"] } } });

  it("resolves camera, hierarchy, screen space, text bindings and layers", async () => {
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors: { s: jsBehavior(() => ({})) } }));
    const frame = rt.frame();
    assert.deepEqual(frame.items.map((i) => i.entity), ["child", "hud", "box"]);
    const box = frame.items.find((i) => i.entity === "box")!;
    assert.deepEqual(box.matrix.map((n) => n + 0), [2, 0, 0, 2, 100, 50]); // centered, zoomed
    const child = frame.items.find((i) => i.entity === "child")!;
    assert.equal(child.matrix[4], 110);
    const hud = frame.items.find((i) => i.entity === "hud")!;
    assert.equal(hud.kind === "text" && hud.text, "HP 3");
    assert.deepEqual(hud.matrix.slice(4), [8, 16]);
  });
});

describe("plugins", () => {
  const scene: SceneSource = { format: 1, entities: [{ id: "a", extensions: { spin: { speed: 2 } } }, { id: "b" }] };

  it("runs the lifecycle and exposes declared capabilities", async () => {
    const calls: string[] = [];
    const spin = definePlugin<{ scale: number }>({
      name: "spin",
      version: "0.0.0",
      pluginApi: 1,
      capabilities: ["world.read", "world.write", "events"],
      extensionSchema: { type: "object", properties: { speed: { type: "number" } } },
      create(ctx: PluginContext, config) {
        calls.push(`create:${config.scale}`);
        ctx.events.on("ping", (e) => calls.push(`ping:${e.value}`));
        return {
          start: () => calls.push(`start:${ctx.world.withExtension().join(",")}`),
          update: (dt) => {
            const speed = ctx.world.extension("a")!.speed as number;
            ctx.world.setTransform("a", { rotation: ctx.world.transform("a").rotation + speed * config.scale * dt });
            if (ctx.time.tick === 1) ctx.events.emit("ping", 7);
          },
          stop: () => calls.push("stop"),
          dispose: () => calls.push("dispose"),
        };
      },
    });
    const m = manifest({ plugins: { spin: { module: "./spin.js", config: { scale: 3 } } } });
    const rt = await Runtime.create(project(scene, { manifest: m, plugins: { spin } }));
    rt.step();
    rt.step();
    rt.stop();
    rt.dispose();
    assert.deepEqual(calls, ["create:3", "start:a", "ping:7", "stop", "dispose"]);
    assert.ok(Math.abs((rt.read("a", "transform.rotation") as number) - (2 * 3 * 2) / 60) < 1e-9);
  });

  it("enforces capabilities, API level and extension schemas", async () => {
    const base = { version: "0.0.0", pluginApi: 1, name: "spin" };
    const m = manifest({ plugins: { spin: { module: "./spin.js" } } });

    const sneaky = definePlugin({
      ...base,
      capabilities: ["world.read"],
      create: (ctx) => ({ update: () => ctx.world.setActive("a", false) }),
    });
    const rt = await Runtime.create(project(scene, { manifest: m, plugins: { spin: sneaky } }));
    assert.throws(() => rt.step(), /MS4003/);

    const old = definePlugin({ ...base, pluginApi: 0, capabilities: [], create: () => {} });
    await assert.rejects(Runtime.create(project(scene, { manifest: m, plugins: { spin: old } })), /MS4002/);

    const strict = definePlugin({
      ...base,
      capabilities: [],
      extensionSchema: { type: "object", properties: { speed: { type: "string" } } },
      create: () => {},
    });
    await assert.rejects(Runtime.create(project(scene, { manifest: m, plugins: { spin: strict } })), /MS4004/);
  });
});

describe("headless tests", () => {
  it("applies setup operations, scripted input and assertions", async () => {
    const result = await runTest(moverProject(), {
      format: 1,
      name: "reaches goal",
      ticks: 30,
      setup: [{ operation: "set_property", target: "goal", property: "transform.position.x", value: 20 }],
      input: [
        { tick: 0, set: { moveX: 1 } },
        { tick: 20, set: { moveX: 0 } },
      ],
      expect: [
        { target: "player", property: "transform.position.x", approx: 20, tolerance: 1e-6 },
        { event: "bump" },
        { target: "goal", exists: true },
      ],
    });
    assert.equal(result.passed, true, JSON.stringify(result.diagnostics));
    assert.equal(result.ticks, 30);

    const failing = await runTest(moverProject(), {
      format: 1,
      name: "wrong",
      ticks: 1,
      expect: [{ target: "player", property: "transform.position.x", gt: 100 }, { target: "player", property: "nope" }],
    });
    assert.equal(failing.passed, false);
    assert.deepEqual(failing.diagnostics.map((d) => d.code), ["MS5001", "MS5001"]);
  });
});

describe("multiple behaviors per entity", () => {
  it("runs each behavior in list order with its own params, sharing entity state", async () => {
    const m = manifest({
      behaviors: {
        add: { wasm: "add.wasm", params: ["amount"], state: ["value"] },
        double: { wasm: "double.wasm", state: ["value"] },
      },
    });
    const add = jsBehavior((h) => ({ ms_update: (self) => h.state_set(self, 0, h.state_get(self, 0) + h.param(0)) }));
    const double = jsBehavior((h) => ({ ms_update: (self) => h.state_set(self, 0, h.state_get(self, 0) * 2) }));
    const scene: SceneSource = {
      format: 1,
      entities: [
        {
          id: "e",
          components: { behavior: [{ module: "add", params: { amount: 3 }, state: { value: 1 } }, { module: "double" }] },
        },
      ],
    };
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors: { add, double } }));
    rt.step();
    assert.equal(rt.read("e", "state.value"), (1 + 3) * 2);
  });

  it("isolates a trap to the behavior that trapped", async () => {
    const m = manifest({ behaviors: { bad: { wasm: "b.wasm" }, good: { wasm: "g.wasm", state: ["n"] } } });
    const bad = jsBehavior(() => ({ ms_update: () => { throw new Error("boom"); } }));
    const good = jsBehavior((h) => ({ ms_update: (self) => h.state_set(self, 0, h.state_get(self, 0) + 1) }));
    const scene: SceneSource = { format: 1, entities: [{ id: "e", components: { behavior: [{ module: "bad" }, { module: "good" }] } }] };
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors: { bad, good } }));
    rt.step();
    rt.step();
    assert.equal(rt.diagnostics.length, 1);
    assert.equal(rt.read("e", "state.n"), 2);
  });
});

describe("spawning and removal", () => {
  const m = manifest({
    prefabs: {
      spark: {
        components: { transform: { position: [0, 0] }, shape: { kind: "circle", radius: 1 }, behavior: { module: "spark", params: { life: 3 } } },
        extensions: { tracker: {} },
      },
    },
    behaviors: {
      emitter: { wasm: "e.wasm", prefabs: ["spark"], state: ["last"] },
      spark: { wasm: "s.wasm", params: ["life"], state: ["age", "started"] },
    },
  });
  const scene: SceneSource = { format: 1, entities: [{ id: "emitter", components: { transform: { position: [50, 60] }, behavior: { module: "emitter" } } }] };

  // Spawns one spark per tick at its own position and remembers the handle.
  const emitter = jsBehavior((h) => ({
    ms_update(self) {
      const spark = h.spawn(0);
      h.transform_set(spark, 0, h.transform_get(self, 0));
      h.transform_set(spark, 1, h.transform_get(self, 1));
      h.state_set(self, 0, spark);
    },
  }));
  // Counts its age and removes itself after `life` updates.
  const spark = jsBehavior((h) => ({
    ms_start: (self) => h.state_set(self, 1, 1),
    ms_update(self) {
      const age = h.state_get(self, 0) + 1;
      h.state_set(self, 0, age);
      if (age >= h.param(0)) h.remove(self);
    },
  }));
  const behaviors = { emitter, spark };

  it("spawns with generated ids, starts at end of tick, and removes later", async () => {
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors }));
    rt.step();
    assert.equal(rt.countSpawned("spark"), 1);
    assert.equal(rt.read("spark-1", "state.started"), 1, "ms_start ran at end of the spawn tick");
    assert.equal(rt.read("spark-1", "state.age"), undefined, "not updated in the tick it was spawned");
    assert.equal(rt.read("spark-1", "transform.position.x"), 50);
    const spawned = rt.world.byStableId("spark-1")!;
    assert.deepEqual(spawned.previous, spawned.transform, "no interpolation from the prefab origin");

    for (let i = 0; i < 10; i++) rt.step();
    // A spark spawned at tick t is updated at t+1..t+3 and removed at the end of t+3,
    // so after any tick exactly the sparks from the last 3 ticks are alive.
    assert.equal(rt.countSpawned("spark"), 3);
    assert.equal(rt.read("spark-1", "active"), undefined, "removed entities are gone");
    assert.equal(rt.diagnostics.length, 0);
  });

  it("never reuses handles, and reports stale handles as not existing", async () => {
    const probe = jsBehavior((h) => ({
      ms_update(self) {
        const last = h.state_get(self, 0);
        // spark-1 (handle 1) is spawned at tick 1 and removed at the end of tick 4.
        if (h.time() > 4.5 / 60) h.log(h.entity_exists(1));
        if (last === 0) h.state_set(self, 0, h.spawn(0));
      },
    }));
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors: { emitter: probe, spark } }));
    for (let i = 0; i < 6; i++) rt.step();
    assert.equal(rt.world.get(1), undefined);
    assert.ok(rt.logs.length > 0 && rt.logs.every((l) => l.value === 0));
    assert.throws(() => rt.world.get(1)!.id);
  });

  it("removes descendants with their parent", async () => {
    const remover = jsBehavior((h) => ({ ms_update: (self) => h.remove(self) }));
    const nested: SceneSource = {
      format: 1,
      entities: [
        { id: "root", components: { behavior: { module: "emitter" } } },
        { id: "child", parent: "root" },
        { id: "grandchild", parent: "child" },
        { id: "other" },
      ],
    };
    const rt = await Runtime.create(project(nested, { manifest: m, behaviors: { emitter: remover, spark } }));
    rt.step();
    assert.deepEqual(rt.world.entities.map((e) => e.id), ["other"]);
  });

  it("gives plugins spawn/remove and lifecycle hooks", async () => {
    const seen: string[] = [];
    const tracker = definePlugin({
      name: "tracker",
      version: "0.0.0",
      pluginApi: 2,
      capabilities: ["world.read", "world.write"],
      create: (ctx) => ({
        start: () => seen.push(`spawned:${ctx.world.spawn("spark")}`),
        entityAdded: (id) => seen.push(`added:${id}`),
        entityRemoved: (id) => seen.push(`removed:${id}`),
        update: () => {
          if (ctx.time.tick === 2) ctx.world.remove("spark-1");
        },
      }),
    });
    const quiet = jsBehavior(() => ({}));
    const pm = { ...m, plugins: { tracker: { module: "./tracker.js" } } };
    const rt = await Runtime.create(project(scene, { manifest: pm, behaviors: { emitter: quiet, spark: quiet }, plugins: { tracker } }));
    rt.step();
    rt.step();
    assert.deepEqual(seen, ["spawned:spark-1", "added:spark-1", "removed:spark-1"]);
  });
});

describe("sprites", () => {
  const m = manifest({
    assets: {
      sheet: { path: "sheet.png", frame: { width: 16, height: 8, columns: 3, count: 5 }, pixelated: true },
      plain: { path: "plain.png" },
    },
    behaviors: { driver: { wasm: "d.wasm", state: ["pose"] } },
    prefabs: { puff: { components: { sprite: { asset: "sheet", animation: { fps: 60, loop: false } } } } },
  });
  const scene: SceneSource = {
    format: 1,
    entities: [
      { id: "still", components: { sprite: { asset: "sheet", frame: 4, flipX: true, anchor: [0, 1] } } },
      { id: "anim", components: { sprite: { asset: "sheet", animation: { fps: 30, frames: [1, 2] } } } },
      { id: "driven", components: { sprite: { asset: "sheet", frameState: "pose" }, behavior: { module: "driver", state: { pose: 7 } } } },
      { id: "whole", components: { sprite: { asset: "plain", size: [10, 20] } } },
    ],
  };

  it("selects frames, source rectangles, size, flip and anchor", async () => {
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors: { driver: jsBehavior(() => ({})) } }));
    const sprites = () => Object.fromEntries(rt.frame().items.flatMap((i) => (i.kind === "sprite" ? [[i.entity, i]] : [])));
    let s = sprites();
    assert.equal(s.still!.frame, 4);
    assert.deepEqual(s.still!.source, [16, 8, 16, 8]); // frame 4 = column 1, row 1
    assert.deepEqual(s.still!.size, [16, 8]);
    assert.deepEqual(s.still!.anchor, [0, 1]);
    assert.equal(s.still!.matrix[0], -1, "flipX mirrors horizontally");
    assert.equal(s.still!.pixelated, true);
    assert.equal(s.driven!.frame, 2, "frameState wraps around the frame count (7 % 5)");
    assert.equal(s.whole!.source, undefined);
    assert.deepEqual(s.whole!.size, [10, 20]);
    assert.equal(s.anim!.frame, 1);
    rt.step();
    rt.step(); // 2 ticks at 60 Hz = 1 frame at 30 fps
    s = sprites();
    assert.equal(s.anim!.frame, 2);
    rt.step();
    rt.step();
    assert.equal(sprites().anim!.frame, 1, "animation loops");
  });

  it("animates spawned entities from their spawn tick", async () => {
    const spawner = jsBehavior((h) => ({ ms_update: () => { if (h.time() < 0.02) h.spawn(0); } }));
    const mm = { ...m, behaviors: { spawner: { wasm: "s.wasm", prefabs: ["puff"] } } };
    const sc: SceneSource = { format: 1, entities: [{ id: "s", components: { behavior: { module: "spawner" } } }] };
    const rt = await Runtime.create(project(sc, { manifest: mm, behaviors: { spawner } }));
    for (let i = 0; i < 4; i++) rt.step();
    rt.step();
    const puff = rt.frame().items.find((i) => i.entity === "puff-1");
    assert.equal(puff?.kind === "sprite" && puff.frame, 4, "born at tick 1, 4 ticks later at 60 fps = frame 4");
    for (let i = 0; i < 10; i++) rt.step();
    const held = rt.frame().items.find((i) => i.entity === "puff-1");
    assert.equal(held?.kind === "sprite" && held.frame, 4, "loop: false holds the last frame");
  });
});

describe("plugin API 3", () => {
  it("awaits load(), exposes components, handles, parents, project settings and sourced events", async () => {
    const seen: string[] = [];
    let loaded = false;
    const probe = definePlugin({
      name: "probe",
      version: "0.0.0",
      pluginApi: 3,
      provides: ["physics"],
      capabilities: ["world.read", "events"],
      async load() {
        await Promise.resolve();
        loaded = true;
      },
      create(ctx) {
        seen.push(`loaded:${loaded}`);
        seen.push(`gravity:${ctx.project.physics?.gravity?.join(",")}`);
        seen.push(`body:${JSON.stringify(ctx.world.component("box", "physicsBody"))}`);
        seen.push(`handle:${ctx.world.handle("box")}:${ctx.world.handle("nope")}`);
        seen.push(`parent:${ctx.world.parent("lid")}:${ctx.world.parent("box")}`);
        return { update: () => ctx.time.tick === 1 && ctx.events.emit("hit", ctx.world.handle("lid"), "box") };
      },
    });
    const listener = jsBehavior((h) => ({ ms_event: (_self, _event, source, value) => h.log(source * 100 + value) }));
    const m = manifest({
      physics: { gravity: [0, 500] },
      plugins: { probe: { module: "./probe.js" } },
      behaviors: { listen: { wasm: "l.wasm", events: ["hit"] } },
    });
    const scene: SceneSource = {
      format: 1,
      entities: [
        { id: "box", components: { physicsBody: { type: "dynamic", mass: 2 }, collider: { shape: "box", size: [4, 4] } } },
        { id: "lid", parent: "box", components: { behavior: { module: "listen" } } },
      ],
    };
    const rt = await Runtime.create(project(scene, { manifest: m, plugins: { probe }, behaviors: { listen: listener } }));
    rt.step();
    assert.deepEqual(seen, ["loaded:true", "gravity:0,500", 'body:{"type":"dynamic","mass":2}', "handle:0:-1", "parent:box:null"]);
    assert.deepEqual(rt.events.map((e) => [e.name, e.source, e.value]), [["hit", "box", 1]]);
    assert.equal(rt.logs[0]!.value, 0 * 100 + 1, "behaviors receive the source entity's handle");
  });
});

describe("scene switching and sounds (ABI 3)", () => {
  const m = manifest({
    scenes: { a: "a.json", b: "b.json" },
    entryScene: "a",
    assets: { beep: { path: "beep.wav" } },
    behaviors: {
      go: { wasm: "go.wasm", scenes: ["b"], sounds: ["beep"], state: ["n"] },
      count: { wasm: "c.wasm", state: ["n"] },
    },
    plugins: { watch: { module: "./watch.js" } },
  });
  const a: SceneSource = { format: 1, entities: [{ id: "switcher", components: { behavior: { module: "go" } } }] };
  const b: SceneSource = { format: 1, entities: [{ id: "counter", components: { behavior: { module: "count" }, sprite: { asset: "beep" } } }] };
  // At tick 3: beep, then switch to b.
  const go = jsBehavior((h) => ({
    ms_update(self) {
      const n = h.state_get(self, 0) + 1;
      h.state_set(self, 0, n);
      if (n === 3) {
        h.play_sound(0, 2);
        h.load_scene(0);
      }
    },
  }));
  const count = jsBehavior((h) => ({ ms_start: (self) => h.state_set(self, 0, 100), ms_update: (self) => h.state_set(self, 0, h.state_get(self, 0) + 1) }));

  it("switches at the end of the tick, restarts behaviors and plugins, and records sounds", async () => {
    const log: string[] = [];
    const watch = definePlugin({
      name: "watch",
      version: "0",
      pluginApi: 3,
      capabilities: ["world.read", "audio"],
      create: (ctx) => ({
        start: () => log.push(`start:${ctx.scene}:${ctx.world.entities().join(",")}`),
        stop: () => log.push(`stop:${ctx.scene}`),
        entityRemoved: (id) => log.push(`removed:${id}`),
        update: () => ctx.time.tick === 5 && ctx.audio.play("beep", 0.5),
      }),
    });
    const rt = await Runtime.create({ manifest: m, scenes: { a, b }, behaviors: { go, count }, plugins: { watch } });
    for (let i = 0; i < 3; i++) rt.step();
    assert.equal(rt.sceneId, "b");
    assert.equal(rt.read("counter", "state.n"), 100, "new scene started, not yet updated");
    assert.equal(rt.read("switcher", "state.n"), undefined);
    rt.step();
    assert.equal(rt.read("counter", "state.n"), 101);
    assert.equal(rt.world.byStableId("counter")!.born, 3);
    rt.step();
    assert.deepEqual(log, ["start:a:switcher", "stop:a", "removed:switcher", "start:b:counter"]);
    assert.deepEqual(rt.sceneHistory, [{ tick: 0, scene: "a" }, { tick: 3, scene: "b" }]);
    assert.deepEqual(rt.sounds.map((s) => [s.tick, s.asset, s.volume, s.source]), [[3, "beep", 1, "switcher"], [5, "beep", 0.5, null]]);
    assert.equal(rt.drainSounds().length, 2);
    assert.equal(rt.drainSounds().length, 0, "drained sounds are not returned again");
  });

  it("supports scene and sound assertions in tests", async () => {
    const result = await runTest({ manifest: m, scenes: { a, b }, behaviors: { go, count }, plugins: { watch: definePlugin({ name: "watch", version: "0", pluginApi: 3, capabilities: [], create: () => {} }) } }, {
      format: 1,
      name: "switch",
      ticks: 4,
      expect: [{ scene: "b" }, { sound: "beep", count: { equals: 1 } }],
    });
    assert.equal(result.passed, true, JSON.stringify(result.diagnostics));
  });
});

describe("performance structures stay correct", () => {
  it("delivers events to spawned listeners and not to removed ones", async () => {
    const m = manifest({
      prefabs: { ear: { components: { behavior: { module: "ear" } } } },
      behaviors: {
        mouth: { wasm: "m", events: ["ping"], prefabs: ["ear"] },
        ear: { wasm: "e", events: ["ping"], state: ["heard"] },
      },
    });
    // tick 1: spawn an ear; ticks 2-3: ping; end of tick 3: remove the ear; tick 4: ping again.
    const mouth = jsBehavior((h) => ({
      ms_update: () => {
        const t = Math.round(h.time() * 60);
        if (t === 1) spawned.push(h.spawn(0));
        if (t >= 2) h.emit(0, 1);
        if (t === 3) h.remove(spawned[0]!);
      },
    }));
    const spawned: number[] = [];
    const ear = jsBehavior((h) => ({ ms_event: (self, _e, _s, v) => h.state_set(self, 0, h.state_get(self, 0) + v) }));
    const scene: SceneSource = { format: 1, entities: [{ id: "mouth", components: { behavior: { module: "mouth" } } }] };
    const rt = await Runtime.create(project(scene, { manifest: m, behaviors: { mouth, ear } }));
    rt.step();
    rt.step();
    rt.step();
    assert.equal(rt.read("ear-1", "state.heard"), undefined, "removed at the end of tick 3");
    rt.step();
    assert.equal(rt.diagnostics.length, 0, "no event reached the removed ear");
    assert.equal(rt.events.filter((e) => e.name === "ping").length, 3);
  });

  it("offsets sprite animations per entity with offset: auto", async () => {
    const { spriteFrame } = await import("./render.js");
    const asset = { path: "a.png", frame: { width: 1, height: 1, columns: 4, count: 4 } };
    const frameOf = (id: string, offset?: number | "auto") =>
      spriteFrame({ asset: "a", animation: { fps: 8, ...(offset !== undefined && { offset }) } }, asset, { id, born: 0, state: new Map() } as never, 0, 1 / 60);
    const frames = ["c1", "c2", "c3", "c4", "c5"].map((id) => frameOf(id, "auto"));
    assert.ok(new Set(frames).size > 1, "copies start on different frames");
    assert.deepEqual(frames, ["c1", "c2", "c3", "c4", "c5"].map((id) => frameOf(id, "auto")), "stable");
    assert.equal(frameOf("x", 2), 2);
    assert.equal(frameOf("x"), 0);
  });
});

describe("plugin drawing (API 4)", () => {
  it("emits custom items for entities carrying a drawing plugin's extension", async () => {
    const drawn: string[] = [];
    const halo = definePlugin({
      name: "halo",
      version: "0",
      pluginApi: 4,
      draws: true,
      capabilities: [],
      create: () => ({ drawSvg: (item) => (drawn.push(item.entity), "<circle r='3'/>") }),
    });
    const scene: SceneSource = {
      format: 1,
      entities: [
        { id: "a", components: { transform: { position: [5, 6] } }, extensions: { halo: { layer: 3, opacity: 0.5, size: [10, 12] } } },
        { id: "b", parent: "a", components: { transform: { position: [1, 0] } }, extensions: { halo: { space: "screen" } } },
        { id: "c", components: { shape: { kind: "circle" } } },
        { id: "d", active: false, extensions: { halo: {} } },
      ],
    };
    const m = manifest({ display: { width: 100, height: 100 }, plugins: { halo: { module: "./halo.js" } } });
    const rt = await Runtime.create(project(scene, { manifest: m, plugins: { halo } }));
    const custom = rt.frame().items.filter((i) => i.kind === "custom");
    assert.deepEqual(custom.map((i) => [i.entity, i.layer, i.opacity, i.size]), [["b", 0, 1, undefined], ["a", 3, 0.5, [10, 12]]]);
    assert.deepEqual(custom.find((i) => i.entity === "b")!.matrix.slice(4), [6, 6], "screen space skips the camera");
    assert.deepEqual(rt.drawingPlugins, ["halo"]);
    assert.equal(rt.plugin("halo")?.drawSvg?.(custom[0]! as never), "<circle r='3'/>");
  });

  it("conformance exercises drawing hooks", async () => {
    const { checkPluginConformance } = await import("./conformance.js");
    const broken = definePlugin({
      name: "broken",
      version: "0",
      pluginApi: 4,
      draws: true,
      capabilities: [],
      create: () => ({ drawCanvas2d: () => { throw new Error("cannot draw"); } }),
    });
    const report = await checkPluginConformance(broken);
    assert.equal(report.checks.find((c) => c.name === "lifecycle")?.passed, false);
    const ok = definePlugin({ ...broken, name: "ok", create: () => ({ drawCanvas2d: (c) => void (c as { fillRect(): void }).fillRect() }) });
    assert.equal((await checkPluginConformance(ok)).passed, true);
  });
});
