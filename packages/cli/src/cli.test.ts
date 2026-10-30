// End-to-end tests: run the real `moonstage` binary against the reference
// project and freshly generated projects. MoonBit-dependent tests are skipped
// when `moon` is not installed, unless MOONSTAGE_REQUIRE_MOON=1 (set in CI).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { findMoon } from "./moonbit.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const bin = join(repo, "packages", "cli", "dist", "main.js");
const example = join(repo, "examples", "moon-hopper");

const hasMoon = findMoon() !== undefined;
if (!hasMoon && process.env.MOONSTAGE_REQUIRE_MOON === "1") throw new Error("MOONSTAGE_REQUIRE_MOON=1 but `moon` was not found");
const moon = { skip: hasMoon ? false : "MoonBit toolchain not installed" };

const scratch = mkdtempSync(join(tmpdir(), "moonstage-cli-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function cli(...args: string[]): { code: number; json: Record<string, any>; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
  let json: Record<string, any> = {};
  if (args.includes("--json")) json = JSON.parse(r.stdout);
  return { code: r.status ?? -1, json, stdout: r.stdout, stderr: r.stderr };
}

describe("moonstage CLI", () => {
  it("describes itself in JSON", () => {
    const r = cli("describe", "--json");
    assert.equal(r.code, 0);
    assert.equal(r.json.moonstage.projectFormat, 1);
    assert.ok(r.json.commands.some((c: { name: string }) => c.name === "render"));
    assert.ok("MS2001" in r.json.diagnosticCodes);
    assert.ok(r.json.behaviorAbi.imports.includes("transform_get"));
  });

  it("serves the bundled docs and skills through guide", () => {
    const list = cli("guide", "--json");
    assert.equal(list.code, 0);
    const names = list.json.topics.map((t: { name: string }) => t.name);
    for (const topic of ["build-game", "moonbit", "behavior-abi", "plugins", "physics"]) assert.ok(names.includes(topic), topic);
    const primer = cli("guide", "moonbit", "--json");
    assert.match(primer.json.content, /Never name a parameter `self`/);
    assert.equal(cli("guide", "nope", "--json").code, 2);
  });

  it("uses meaningful exit codes for usage errors and missing projects", () => {
    assert.equal(cli("frobnicate", "--json").code, 2);
    assert.equal(cli("validate", "--bogus-flag", "--json").code, 2);
    const missing = cli("validate", join(scratch, "nope"), "--json");
    assert.equal(missing.code, 2);
    assert.equal(missing.json.diagnostics[0].code, "MS9002");
  });

  it("validates and inspects the reference project", () => {
    const v = cli("validate", example, "--json");
    assert.equal(v.code, 0, v.stdout);
    assert.equal(v.json.errors, 0);
    const i = cli("inspect", example, "--json");
    assert.equal(i.code, 0);
    const ids = i.json.scenes.main.entities.map((e: { id: string }) => e.id);
    for (const id of ["lander", "flame", "camera", "score", "crystal-1"]) assert.ok(ids.includes(id));
    assert.equal(i.json.behaviors.lander.language, "moonbit");
  });

  it("reports broken projects with stable codes, locations and exit code 1", () => {
    const dir = join(scratch, "broken");
    cpSync(example, dir, { recursive: true, filter: (src) => !src.includes(".moonstage") && !src.includes("dist") });
    const scenePath = join(dir, "scenes", "main.scene.json");
    const scene = JSON.parse(readFileSync(scenePath, "utf8"));
    scene.entities.find((e: { id: string }) => e.id === "flame").parent = "ghost";
    rmSync(join(dir, "assets", "crystal.png"));
    scene.entities.find((e: { id: string }) => e.id === "lander").components.behavior.params.thrustt = 1;
    writeFileSync(scenePath, JSON.stringify(scene));
    const r = cli("validate", dir, "--json");
    assert.equal(r.code, 1);
    const byCode = Object.fromEntries(r.json.diagnostics.map((d: { code: string }) => [d.code, d]));
    assert.equal(byCode.MS2002.entity, "flame");
    assert.equal(byCode.MS2002.file, "scenes/main.scene.json");
    assert.equal(byCode.MS2006.entity, "lander");
    assert.ok(byCode.MS2006.hint);
    assert.equal(byCode.MS1003.path, "assets.crystal.path");
  });

  it("builds MoonBit behaviors and a web bundle", moon, () => {
    const out = join(scratch, "bundle");
    const r = cli("build", example, "--out", out, "--json");
    assert.equal(r.code, 0, r.stdout);
    assert.deepEqual(r.json.behaviors.map((b: { name: string }) => b.name).sort(), ["camera", "crystal", "lander", "pulse", "score", "sparkle", "title"]);
    const html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /<moonstage-player src="\.\/game\/"/);
    readFileSync(join(out, "game", ".moonstage", "behaviors", "lander.wasm"));
    readFileSync(join(out, "runtime", "core", "index.js"));
    readFileSync(join(out, "game", "plugins", "spin.js"));
  });

  it("passes the reference project's tests", moon, () => {
    const r = cli("test", example, "--json");
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.failed, 0);
    assert.equal(r.json.passed, 5);
  });

  it("runs the physics example through its reference provider", moon, () => {
    const physics = join(repo, "examples", "physics-playground");
    const t = cli("test", physics, "--json");
    assert.equal(t.code, 0, t.stdout);
    assert.equal(t.json.passed, 5);
    // @moonstage/physics resolves from the CLI and travels inside packages and single files.
    const single = cli("build", physics, "--single-file", "--out", join(scratch, "physics.html"), "--json");
    assert.equal(single.code, 0, single.stdout);
    const packed = cli("pack", physics, "--out", join(scratch, "physics.msp"), "--json");
    assert.ok(packed.json.files.includes("plugins/moonstage-physics.js"));
    assert.equal(cli("run", join(scratch, "physics.msp"), "--headless", "--ticks", "30", "--json").code, 0);
    assert.equal(cli("plugin", "check", join(physics, "plugins", "arcade-physics.js"), "--json").code, 0);
  });

  it("drives headless runs and renders with an input timeline", moon, () => {
    const script = JSON.stringify([{ tick: 0, set: { thrust: 1 } }, { tick: 40, set: { thrust: 0 } }]);
    const held = cli("run", example, "--headless", "--scene", "main", "--ticks", "60", "--input-script", script, "--json", "--no-build");
    assert.equal(held.code, 0, held.stdout);
    assert.equal(held.json.snapshot.entities.flame.active, false, "thrust released at tick 40");
    const file = join(scratch, "timeline.json");
    writeFileSync(file, JSON.stringify([{ tick: 0, set: { thrust: 1 } }]));
    const render = cli("render", example, "--scene", "main", "--tick", "20", "--input-script", file, "--output", join(scratch, "t.svg"), "--json", "--no-build");
    assert.equal(render.code, 0, render.stdout);
    assert.match(readFileSync(join(scratch, "t.svg"), "utf8"), /data-entity="flame"/, "the flame shows while thrusting");
    assert.equal(cli("run", example, "--headless", "--input-script", "[{]", "--json", "--no-build").code, 2);
  });

  it("switches from the title scene and plays sounds headlessly", moon, () => {
    const r = cli("run", example, "--headless", "--ticks", "20", "--input", '{"thrust":1}', "--json", "--no-build");
    assert.equal(r.code, 0, r.stdout);
    assert.deepEqual(r.json.scenes.map((s: { scene: string }) => s.scene), ["title", "main"]);
    assert.equal(r.json.scene, "main");
  });

  it("simulates headlessly and deterministically", moon, () => {
    const args = ["run", example, "--headless", "--scene", "main", "--ticks", "240", "--seed", "3", "--input", '{"thrust":1}', "--json"];
    const a = cli(...args);
    const b = cli(...args, "--no-build");
    assert.equal(a.code, 0, a.stdout);
    assert.equal(a.json.ticks, 240);
    assert.deepEqual(a.json.snapshot, b.json.snapshot);
    assert.ok(a.json.snapshot.entities.lander.transform.y < 900, "thrust should lift the lander");
    assert.ok(a.json.snapshot.entities["planet-ring"].transform.rotation > 0, "spin plugin should rotate the ring");
  });

  it("renders a frame to SVG", moon, () => {
    const output = join(scratch, "frame.svg");
    const r = cli("render", example, "--scene", "main", "--tick", "30", "--output", output, "--json", "--no-build");
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.tick, 30);
    const svg = readFileSync(output, "utf8");
    assert.match(svg, /^<svg /);
    assert.match(svg, /data-entity="lander"/);
    assert.match(svg, />Crystals: 0 {3}Best: 0</);
    assert.match(svg, /<image id="asset-crystal" href="data:image\/png;base64,[A-Za-z0-9+/=]+" width="64" height="16"/);
    assert.match(svg, /data-entity="crystal-1" data-frame="\d"/);
    assert.match(svg, /data-entity="beacon" data-plugin="radar"><circle /, "drawing plugins render headlessly");
    assert.doesNotMatch(svg, /data-entity="flame"/, "flame is inactive without thrust");
  });

  it("creates a new project that validates and passes its tests", moon, () => {
    const dir = join(scratch, "fresh");
    const created = cli("new", dir, "--name", "Fresh Game", "--json");
    assert.equal(created.code, 0, created.stdout);
    assert.ok(created.json.files.includes("moonstage.json"));
    assert.equal(cli("validate", dir, "--json").code, 0);
    const t = cli("test", dir, "--json");
    assert.equal(t.code, 0, t.stdout);
    assert.equal(t.json.passed, 1);
    assert.equal(cli("new", dir, "--json").code, 2, "refuses to overwrite");
  });

  it("regenerates slot constants when the manifest changes", moon, () => {
    const dir = join(scratch, "slots");
    cli("new", dir);
    const slots = join(dir, "behaviors", "mover", "slots.generated.mbt");
    assert.match(readFileSync(slots, "utf8"), /pub let param_speed : Int32 = 0/);
    const codes = (r: ReturnType<typeof cli>) => r.json.diagnostics.map((d: { code: string }) => d.code);
    assert.ok(!codes(cli("validate", dir, "--json")).includes("MS3008"), "fresh project has current slots");

    // Reorder params: hand-written indices would now be wrong; generated names stay right.
    const manifestPath = join(dir, "moonstage.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.behaviors.mover.params = ["minX", "maxX", "minY", "maxY", "speed"];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const stale = cli("validate", dir, "--json");
    assert.equal(stale.code, 0);
    assert.ok(codes(stale).includes("MS3008"));

    const t = cli("test", dir, "--json");
    assert.equal(t.code, 0, t.stdout);
    assert.match(readFileSync(slots, "utf8"), /pub let param_speed : Int32 = 4/);
    assert.equal(cli("validate", dir, "--json").json.warnings, 0, "built and slots current");
  });

  it("scaffolds a plugin that passes the conformance suite, and flags a broken one", () => {
    const dir = join(scratch, "plugin");
    const created = cli("plugin", "new", dir, "--name", "Bobber", "--json");
    assert.equal(created.code, 0, created.stdout);
    assert.ok(created.json.files.includes("index.js"));
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.equal(pkg.name, "moonstage-plugin-bobber");
    assert.match(pkg.peerDependencies["@moonstage/core"], /^\^\d+\.\d+\.\d+$/);

    const ok = cli("plugin", "check", dir, "--json");
    assert.equal(ok.code, 0, ok.stdout);
    assert.equal(ok.json.plugin, "bobber");
    assert.ok(ok.json.checks.every((c: { passed: boolean }) => c.passed));
    assert.equal(cli("plugin", "check", join(example, "plugins", "spin.js"), "--json").code, 0);
    assert.equal(cli("plugin", "check", join(example, "plugins", "radar.js"), "--json").code, 0);

    // Using a capability without declaring it fails with a stable code.
    const indexPath = join(dir, "index.js");
    writeFileSync(indexPath, readFileSync(indexPath, "utf8").replace('capabilities: ["world.read", "world.write"]', 'capabilities: ["world.read"]'));
    const bad = cli("plugin", "check", dir, "--json");
    assert.equal(bad.code, 1);
    assert.equal(bad.json.checks.find((c: { name: string }) => c.name === "capabilities").passed, false);
    assert.ok(bad.json.diagnostics.some((d: { code: string }) => d.code === "MS4003"));
    assert.equal(cli("plugin", "frobnicate", "--json").code, 2);
  });

  it("edits scenes through validated semantic operations", () => {
    const dir = join(scratch, "edit");
    cli("new", dir);
    const scenePath = join(dir, "scenes", "main.scene.json");
    const ops = JSON.stringify([
      { operation: "add_entity", entity: { id: "coin", components: { shape: { kind: "circle", radius: 4 } } } },
      { operation: "set_property", target: "coin", property: "transform.position", value: [10, 20] },
      { operation: "attach_behavior", target: "coin", behavior: { module: "mover", params: { speed: 1 } } },
    ]);
    const dry = cli("edit", dir, "--op", ops, "--dry-run", "--json");
    assert.equal(dry.code, 0, dry.stdout);
    assert.equal(dry.json.written, false);
    assert.doesNotMatch(readFileSync(scenePath, "utf8"), /coin/);

    const applied = cli("edit", dir, "--op", ops, "--json");
    assert.equal(applied.code, 0, applied.stdout);
    assert.deepEqual(applied.json.added, ["coin"]);
    const coin = JSON.parse(readFileSync(scenePath, "utf8")).entities.find((e: { id: string }) => e.id === "coin");
    assert.deepEqual(coin.components.transform.position, [10, 20]);
    assert.equal(cli("scene", dir, "--json").json.source.entities.length, 3);

    // An edit that breaks the project is rejected and nothing is written.
    const before = readFileSync(scenePath, "utf8");
    const broken = cli("edit", dir, "--op", '{"operation":"set_property","target":"coin","property":"parent","value":"ghost"}', "--json");
    assert.equal(broken.code, 1);
    assert.equal(broken.json.written, false);
    assert.equal(broken.json.diagnostics[0].code, "MS2002");
    assert.equal(readFileSync(scenePath, "utf8"), before);
    assert.equal(cli("edit", dir, "--op", "{not json", "--json").code, 2);
  });

  it("serves the same operations over MCP", () => {
    const dir = join(scratch, "mcp");
    cli("new", dir);
    const messages = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "moonstage_edit_scene", arguments: { dir, operations: [{ operation: "set_property", target: "player", property: "transform.position.x", value: 50 }] } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "moonstage_get_scene", arguments: { dir } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "moonstage_validate", arguments: { dir: join(scratch, "nope") } } },
      { jsonrpc: "2.0", id: 6, method: "bogus" },
    ];
    const r = spawnSync(process.execPath, [bin, "mcp"], { input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n", encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const replies = Object.fromEntries(r.stdout.trim().split("\n").map((l) => JSON.parse(l)).map((m) => [m.id, m]));
    assert.equal(Object.keys(replies).length, 6, "notifications get no reply");
    assert.equal(replies[1].result.protocolVersion, "2025-06-18");
    const names = replies[2].result.tools.map((t: { name: string }) => t.name);
    for (const tool of ["moonstage_describe", "moonstage_edit_scene", "moonstage_test", "moonstage_render", "moonstage_plugin_check"]) {
      assert.ok(names.includes(tool), tool);
    }
    assert.equal(replies[3].result.isError, false);
    const scene = JSON.parse(replies[4].result.content[0].text).source;
    assert.equal(scene.entities.find((e: { id: string }) => e.id === "player").components.transform.position[0], 50);
    assert.equal(replies[5].result.isError, true);
    assert.equal(JSON.parse(replies[5].result.content[0].text).diagnostics[0].code, "MS9002");
    assert.equal(replies[6].error.code, -32601);
  });

  it("bundles npm plugin packages and their dependencies behind an import map", moon, () => {
    const dir = join(scratch, "rive-bundle");
    cli("new", dir);
    const manifestPath = join(dir, "moonstage.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.assets = { hero: { path: "assets/hero.riv" } };
    manifest.plugins = { "@moonstage/rive": { module: "@moonstage/rive" } };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "hero.riv"), Buffer.from("RIVE")); // never parsed headlessly
    // Resolve @moonstage/rive from this repository's node_modules, as an installed project would.
    writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true }));
    mkdirSync(join(dir, "node_modules", "@moonstage"), { recursive: true });
    symlinkSync(realpathSync(join(repo, "node_modules", "@moonstage", "rive")), join(dir, "node_modules", "@moonstage", "rive"));
    const r = cli("build", dir, "--json");
    assert.equal(r.code, 0, r.stdout);
    const html = readFileSync(join(dir, "dist", "index.html"), "utf8");
    const imports = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)![1]!).imports;
    assert.equal(imports["@moonstage/rive"], "./runtime/modules/@moonstage/rive/dist/index.js");
    assert.equal(imports["@rive-app/canvas-advanced"], "./runtime/modules/@rive-app/canvas-advanced/canvas_advanced.mjs");
    readFileSync(join(dir, "dist", "runtime", "modules", "@rive-app", "canvas-advanced", "rive.wasm"));
    assert.throws(() => readFileSync(join(dir, "dist", "runtime", "modules", "@moonstage", "rive", "src", "index.ts")), "sources stay out");
    assert.equal(cli("validate", dir, "--json").code, 0, "the plugin loads headlessly");
  });

  it("builds a self-contained single-file HTML game", moon, () => {
    const output = join(scratch, "single", "hopper.html");
    const r = cli("build", example, "--single-file", "--out", output, "--json");
    assert.equal(r.code, 0, r.stdout);
    const html = readFileSync(output, "utf8");
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/, "no external scripts or styles");
    const modules = JSON.parse(/<script type="application\/json" id="moonstage-modules">([\s\S]*?)<\/script>/.exec(html)![1]!);
    assert.ok("core/index.js" in modules && "player/index.js" in modules && "core/schema/schemas.js" in modules);
    assert.ok(!Object.keys(modules).some((k) => k.endsWith(".test.js")));
    const game = /<script type="application\/octet-stream" id="moonstage-game">([^<]+)<\/script>/.exec(html)![1]!;
    const zip = Buffer.from(game.trim(), "base64");
    assert.equal(zip.readUInt32LE(0), 0x04034b50, "the game is an inlined .msp (ZIP)");
    assert.ok(r.json.bytes < 400 * 1024, `single file stays small (${r.json.bytes} bytes)`);
  });

  it("packs a project into an .msp that runs, validates and unpacks like the source", moon, () => {
    const output = join(scratch, "pack", "hopper.msp");
    const packed = cli("pack", example, "--out", output, "--json");
    assert.equal(packed.code, 0, packed.stdout);
    assert.ok(packed.json.files.includes("msp.json"));
    assert.ok(packed.json.files.includes("behaviors/lander.wasm"));
    assert.ok(!packed.json.files.some((f: string) => f.endsWith(".mbt") || f.startsWith("tests/")));

    assert.equal(cli("validate", output, "--json").code, 0);
    const run = (target: string) =>
      cli("run", target, "--headless", "--scene", "main", "--ticks", "90", "--input", '{"thrust":1}', "--json", "--no-build").json.snapshot;
    assert.deepEqual(run(output), run(example), "a package simulates exactly like its source project");
    assert.equal(cli("edit", output, "--op", "{}", "--json").code, 2, "packages are read-only");

    const dir = join(scratch, "pack", "unpacked");
    const unpacked = cli("unpack", output, dir, "--json");
    assert.equal(unpacked.code, 0, unpacked.stdout);
    const manifest = JSON.parse(readFileSync(join(dir, "moonstage.json"), "utf8"));
    assert.deepEqual(manifest.behaviors.lander.wasm, "behaviors/lander.wasm");
    assert.equal(manifest.behaviors.lander.source, undefined);
    assert.equal(cli("validate", dir, "--json").code, 0);
    assert.equal(cli("unpack", output, dir, "--json").code, 2, "refuses a non-empty directory");
  });

  it("rejects packages with entries outside the package", async () => {
    const { writeZip } = await import("./zip.js");
    const evil = join(scratch, "evil.msp");
    writeFileSync(evil, writeZip([{ path: "msp.json", data: Buffer.from('{"format":1,"name":"x"}') }, { path: "../escape.txt", data: Buffer.from("x") }]));
    const r = cli("unpack", evil, join(scratch, "evil-out"), "--json");
    assert.equal(r.code, 1);
    assert.equal(r.json.diagnostics[0].code, "MS1005");
    assert.equal(cli("validate", join(scratch, "evil.msp"), "--json").json.diagnostics[0].code, "MS1003");
  });

  for (const template of ["platformer", "shooter"]) {
    it(`creates a ${template} from its template that passes its own tests`, moon, () => {
      const dir = join(scratch, `tpl-${template}`);
      assert.equal(cli("new", dir, "--template", template, "--json").code, 0);
      const t = cli("test", dir, "--json");
      assert.equal(t.code, 0, t.stdout);
      assert.ok(t.json.passed >= 3);
      assert.equal(cli("validate", dir, "--json").json.warnings, 0);
      const single = cli("build", dir, "--single-file", "--json");
      assert.equal(single.code, 0, single.stdout);
    });
  }

  it("rejects unknown templates", () => {
    const r = cli("new", join(scratch, "nope"), "--template", "rpg", "--json");
    assert.equal(r.code, 2);
    assert.match(r.json.diagnostics[0].message, /minimal, platformer, shooter/);
  });

  it("reports MoonBit compile errors as MS3006 with file locations", moon, () => {
    const dir = join(scratch, "compile-error");
    cli("new", dir);
    writeFileSync(join(dir, "behaviors", "mover", "broken.mbt"), '///|\nfn broken() -> Int {\n  "not an int"\n}\n');
    const r = cli("test", dir, "--json");
    assert.equal(r.code, 1);
    const d = r.json.diagnostics.find((x: { code: string }) => x.code === "MS3006");
    assert.ok(d, r.stdout);
    assert.equal(d.file, "behaviors/mover/broken.mbt");
    assert.match(d.message, /MoonBit error 4014/);
    assert.match(d.hint, /\|> ignore|to_double|Type mismatch/);
  });
});
