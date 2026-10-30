import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPluginConformance, Runtime, type BehaviorFactory, type LoadedProject } from "@moonstage/core";
import plugin, { createRivePlugin, PLUGIN_NAME } from "./index.js";

/** A stand-in for @rive-app/canvas-advanced that records what the plugin does. */
function fakeRive() {
  const log: string[] = [];
  const created: { inputs: { name: string; value: number | boolean | undefined }[] }[] = [];
  let reportOnce = true;
  class StateMachineInstance {
    readonly inputs = [
      { name: "speed", value: 0 as number | boolean | undefined },
      { name: "grounded", value: false as number | boolean | undefined },
      { name: "jump", value: undefined as number | boolean | undefined, asTrigger: () => ({ fire: () => log.push("fire:jump") }) },
    ];
    constructor(definition: { name: string }, _artboard: unknown) {
      log.push(`machine:${definition.name}`);
      created.push(this);
    }
    inputCount() {
      return this.inputs.length;
    }
    input(i: number) {
      return this.inputs[i];
    }
    advance() {
      return true;
    }
    reportedEventCount() {
      return reportOnce ? 1 : 0;
    }
    reportedEventAt() {
      reportOnce = false;
      return { name: "footstep" };
    }
    delete() {
      log.push("delete:machine");
    }
  }
  const artboard = (name: string) => ({
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
    stateMachineCount: () => 1,
    animationCount: () => 0,
    stateMachineByIndex: () => ({ name: "Main" }),
    stateMachineByName: (n: string) => ({ name: n }),
    advance: () => true,
    draw: () => log.push(`draw:${name}`),
    delete: () => log.push(`delete:${name}`),
  });
  class CanvasRenderer {
    save() {}
    restore() {}
    align(_fit: number, _alignment: unknown, frame: { minX: number }) {
      log.push(`align:${frame.minX}`);
    }
    beginFrame(clear: boolean) {
      log.push(`begin:${clear}`);
    }
  }
  const runtime = {
    makeRenderer: () => new CanvasRenderer(),
    resolveAnimationFrame: () => log.push("resolve"),
    load: async (bytes: Uint8Array) => {
      log.push(`load:${bytes.length}`);
      return { defaultArtboard: () => artboard("default"), artboardByName: (n: string) => artboard(n) };
    },
    StateMachineInstance,
    CanvasRenderer,
    Fit: { contain: 1, cover: 2 },
    Alignment: { center: "center" },
  };
  return { runtime, log, created, machines: () => log.filter((l) => l.startsWith("machine:")) };
}

const behavior = (impl: Partial<ReturnType<BehaviorFactory> & object>): BehaviorFactory => () =>
  ({ ms_abi_version: () => 3, ms_start() {}, ms_update() {}, ms_event() {}, ...impl }) as never;

function project(fake: ReturnType<typeof fakeRive>): LoadedProject {
  const rive = createRivePlugin({ loadRuntime: async () => fake.runtime as never });
  return {
    manifest: {
      format: 1,
      name: "rive-test",
      entryScene: "main",
      scenes: { main: "main.json" },
      assets: { hero: { path: "hero.riv" }, other: { path: "x.png" } },
      prefabs: { extra: { extensions: { [PLUGIN_NAME]: { asset: "hero", artboard: "Extra", size: [10, 10] } } } },
      behaviors: { pilot: { wasm: "p", state: ["speed", "grounded"], events: ["jumped", "footstep"], prefabs: ["extra"] } },
      plugins: { [PLUGIN_NAME]: { module: PLUGIN_NAME } },
    },
    scenes: {
      main: {
        format: 1,
        entities: [
          {
            id: "hero",
            components: { behavior: { module: "pilot", state: { speed: 0, grounded: 0 } } },
            extensions: {
              [PLUGIN_NAME]: { asset: "hero", size: [200, 100], inputs: { speed: "speed", grounded: "grounded" }, triggers: { jump: "jumped" } },
            },
          },
        ],
      },
    },
    behaviors: {},
    plugins: { [PLUGIN_NAME]: rive },
    readFile: async (path) => (path === "hero.riv" ? new Uint8Array(7) : undefined),
  };
}

describe("@moonstage/rive", () => {
  it("loads .riv assets, drives state machine inputs from state, fires triggers and reports events", async () => {
    const fake = fakeRive();
    const p = project(fake);
    const heard: number[] = [];
    let spawned = -1;
    p.behaviors.pilot = ({ moonstage: h }) =>
      behavior({
        ms_update(self: number) {
          const tick = Math.round(h.time() * 60);
          h.state_set(self, 0, tick * 10);
          h.state_set(self, 1, tick % 2);
          if (tick === 2) h.emit(0, 1);
          if (tick === 3) spawned = h.spawn(0);
          if (tick === 4) h.remove(spawned);
        },
        ms_event(_self: number, event: number, source: number) {
          if (event === 1) heard.push(source);
        },
      })(undefined as never);
    const rt = await Runtime.create(p);
    for (let i = 0; i < 5; i++) rt.step();

    assert.ok(fake.log.includes("load:7"), "only .riv assets are loaded");
    assert.equal(fake.log.filter((l) => l.startsWith("load:")).length, 1);
    assert.deepEqual(fake.machines(), ["machine:Main", "machine:Main"], "default machine for the hero and the spawned extra");
    assert.equal(fake.log.filter((l) => l === "fire:jump").length, 1, "trigger fired by the hero's own event");
    assert.deepEqual(heard, [0], "Rive-reported events arrive as Moonstage events from the entity");
    assert.ok(fake.log.includes("delete:Extra"), "removed entity's artboard is released");

    const hero = rt.frame().items.find((i) => i.kind === "custom" && i.entity === "hero")!;
    assert.equal(hero.kind === "custom" && hero.plugin, PLUGIN_NAME);
    const drawn: string[] = [];
    const before = fake.log.length;
    rt.plugin(PLUGIN_NAME)!.drawCanvas2d!({ canvas: {} } as never, hero as never);
    drawn.push(...fake.log.slice(before));
    assert.deepEqual(drawn, ["begin:false", "align:-100", "draw:default", "resolve"], "draws centered in the entity's local space, without clearing");

    rt.stop();
    assert.ok(fake.log.includes("delete:default") && fake.log.includes("delete:machine"));
  });

  it("maps state values onto number and boolean inputs", async () => {
    const fake = fakeRive();
    const p = project(fake);
    p.behaviors.pilot = ({ moonstage: h }) =>
      behavior({ ms_update: (self: number) => (h.state_set(self, 0, 42), h.state_set(self, 1, 1)) })(undefined as never);
    const rt = await Runtime.create(p);
    rt.step();
    rt.step();
    const inputs = Object.fromEntries(fake.created[0]!.inputs.map((i) => [i.name, i.value]));
    assert.equal(inputs.speed, 42, "number input <- state");
    assert.equal(inputs.grounded, true, "boolean input <- state != 0");
    const svg = rt.plugin(PLUGIN_NAME)!.drawSvg!(rt.frame().items.find((i) => i.entity === "hero") as never);
    assert.match(svg!, /<rect x="-100" y="-50" width="200" height="100"/);
  });

  it("passes the conformance suite headlessly (no Rive runtime in Node)", async () => {
    const report = await checkPluginConformance(plugin, { extension: { asset: "hero", size: [64, 64] } });
    assert.equal(report.passed, true, JSON.stringify(report.checks.filter((c) => !c.passed)));
  });
});
