// Runtime benchmarks at scale. Prints a Markdown table of milliseconds per
// simulation tick (and per frame build). Run after `npm run build`; uses the
// built core and, when present, the compiled Moon Hopper behaviors.
//
//   node scripts/bench.mjs            # all scenarios
//   node scripts/bench.mjs --quick    # fewer ticks (for CI summaries)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Runtime } from "../packages/core/dist/index.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const quick = process.argv.includes("--quick");
const TICKS = quick ? 60 : 240;

const manifest = (extra = {}) => ({ format: 1, name: "bench", entryScene: "main", scenes: { main: "x" }, ...extra });
const js = (impl) => ({ moonstage: h }) => ({ ms_abi_version: () => 3, ms_start() {}, ms_update() {}, ms_event() {}, ...impl(h) });

async function measure(name, project, { ticks = TICKS, frames = true } = {}) {
  const rt = await Runtime.create(project);
  rt.start();
  for (let i = 0; i < 10; i++) rt.step(); // warm up
  let t = performance.now();
  for (let i = 0; i < ticks; i++) rt.step();
  const tick = (performance.now() - t) / ticks;
  let frame = NaN;
  if (frames) {
    t = performance.now();
    for (let i = 0; i < 30; i++) rt.frame(0.5);
    frame = (performance.now() - t) / 30;
  }
  return { name, entities: rt.world.entities.length, tick, frame, problems: rt.diagnostics.length };
}

const grid = (n, components) =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    components: { transform: { position: [(i % 100) * 8, Math.floor(i / 100) * 8] }, ...components(i) },
  }));

const results = [];

// 1. Many entities, each with a behavior that reads and writes its transform.
{
  const mover = js((h) => ({ ms_update: (e, dt) => h.transform_set(e, 0, h.transform_get(e, 0) + h.param(0) * dt) }));
  const entities = grid(5000, () => ({ shape: { kind: "rect", size: [4, 4] }, behavior: { module: "mover", params: { speed: 10 } } }));
  results.push(
    await measure("5k behaviors (JS host calls) + shapes", {
      manifest: manifest({ behaviors: { mover: { wasm: "m", params: ["speed"] } } }),
      scenes: { main: { format: 1, entities } },
      behaviors: { mover },
      plugins: {},
    }),
  );
}

// 2. The same with a real MoonBit/WebAssembly behavior (pulse: state + sin + scale).
{
  const wasm = join(repo, "examples/moon-hopper/.moonstage/behaviors/pulse.wasm");
  if (existsSync(wasm)) {
    const entities = grid(5000, () => ({ shape: { kind: "circle", radius: 2 }, behavior: { module: "pulse", params: { speed: 3, amount: 0.2 } } }));
    results.push(
      await measure("5k MoonBit wasm behaviors", {
        manifest: manifest({ behaviors: { pulse: { wasm: "p", params: ["speed", "amount"], state: ["phase"] } } }),
        scenes: { main: { format: 1, entities } },
        behaviors: { pulse: new Uint8Array(readFileSync(wasm)) },
        plugins: {},
      }),
    );
  }
}

// 3. Event fan-out: 50 events per tick, 2k listeners declaring the event plus 3k bystanders.
{
  const emitter = js((h) => ({ ms_update: () => { for (let i = 0; i < 50; i++) h.emit(0, i); } }));
  const listener = js((h) => ({ ms_event: (e, _ev, _s, v) => h.state_set(e, 0, v) }));
  const bystander = js(() => ({}));
  const entities = [
    { id: "emitter", components: { behavior: { module: "emitter" } } },
    ...grid(2000, () => ({ behavior: { module: "listener" } })),
    ...grid(3000, () => ({ behavior: { module: "bystander" } })).map((e) => ({ ...e, id: `b${e.id}` })),
  ];
  results.push(
    await measure("50 events/tick to 2k listeners (5k entities)", {
      manifest: manifest({
        behaviors: {
          emitter: { wasm: "e", events: ["ping"] },
          listener: { wasm: "l", events: ["ping"], state: ["last"] },
          bystander: { wasm: "b" },
        },
      }),
      scenes: { main: { format: 1, entities } },
      behaviors: { emitter, listener, bystander },
      plugins: {},
    }, { frames: false }),
  );
}

// 4. Spawn churn: 100 spawns per tick, each removing itself after 30 ticks (~3k live).
{
  const spawner = js((h) => ({ ms_update: () => { for (let i = 0; i < 100; i++) h.spawn(0); } }));
  const particle = js((h) => ({
    ms_update: (e) => {
      const age = h.state_get(e, 0) + 1;
      h.state_set(e, 0, age);
      if (age >= 30) h.remove(e);
    },
  }));
  results.push(
    await measure("100 spawns + 100 removals per tick", {
      manifest: manifest({
        prefabs: { p: { components: { shape: { kind: "circle", radius: 1 }, behavior: { module: "particle" } } } },
        behaviors: { spawner: { wasm: "s", prefabs: ["p"] }, particle: { wasm: "p", state: ["age"] } },
      }),
      scenes: { main: { format: 1, entities: [{ id: "spawner", components: { behavior: { module: "spawner" } } }] } },
      behaviors: { spawner, particle },
      plugins: {},
    }),
  );
}

// 5. Deep hierarchy: 5k entities in chains of 10.
{
  const entities = Array.from({ length: 5000 }, (_, i) => ({
    id: `n${i}`,
    ...(i % 10 !== 0 && { parent: `n${i - 1}` }),
    components: { transform: { position: [1, 1], rotation: 0.01 }, shape: { kind: "rect", size: [2, 2] } },
  }));
  results.push(
    await measure("5k entities in 10-deep hierarchies (frame build)", {
      manifest: manifest(),
      scenes: { main: { format: 1, entities } },
      behaviors: {},
      plugins: {},
    }),
  );
}

// 6. Physics: 600 dynamic circles in a walled box with the reference provider.
{
  const plugin = (await import("../examples/physics-playground/plugins/arcade-physics.js")).default;
  const walls = [
    { id: "floor", components: { transform: { position: [400, 610] }, collider: { shape: "box", size: [820, 20] } } },
    { id: "left", components: { transform: { position: [-10, 300] }, collider: { shape: "box", size: [20, 640] } } },
    { id: "right", components: { transform: { position: [810, 300] }, collider: { shape: "box", size: [20, 640] } } },
  ];
  const balls = Array.from({ length: 600 }, (_, i) => ({
    id: `ball${i}`,
    components: {
      transform: { position: [20 + (i % 40) * 19, 20 + Math.floor(i / 40) * 19] },
      physicsBody: {},
      collider: { shape: "circle", radius: 8, restitution: 0.3 },
    },
  }));
  results.push(
    await measure("600 physics bodies (arcade-physics, 4 substeps)", {
      manifest: manifest({ plugins: { "arcade-physics": { module: "x" } } }),
      scenes: { main: { format: 1, entities: [...walls, ...balls] } },
      behaviors: {},
      plugins: { "arcade-physics": plugin },
    }, { ticks: quick ? 30 : 120 }),
  );
}

const ms = (n) => (Number.isNaN(n) ? "–" : n.toFixed(2));
console.log(`| scenario | entities | ms/tick | ms/frame build |`);
console.log(`| --- | ---: | ---: | ---: |`);
for (const r of results) {
  console.log(`| ${r.name} | ${r.entities} | ${ms(r.tick)} | ${ms(r.frame)} |${r.problems ? ` ⚠ ${r.problems} runtime problems` : ""}`);
}
console.log(`\nA 60 Hz game has 16.7 ms per frame for everything. Node ${process.version}, ${TICKS} ticks per scenario.`);
