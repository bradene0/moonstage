// End-to-end tests: run the real `moonstage` binary against the reference
// project and freshly generated projects. MoonBit-dependent tests are skipped
// when `moon` is not installed, unless MOONSTAGE_REQUIRE_MOON=1 (set in CI).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    assert.deepEqual(r.json.behaviors.map((b: { name: string }) => b.name).sort(), ["camera", "crystal", "lander", "pulse", "score", "sparkle"]);
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
    assert.equal(r.json.passed, 4);
  });

  it("simulates headlessly and deterministically", moon, () => {
    const args = ["run", example, "--headless", "--ticks", "240", "--seed", "3", "--input", '{"thrust":1}', "--json"];
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
    const r = cli("render", example, "--tick", "30", "--output", output, "--json", "--no-build");
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.tick, 30);
    const svg = readFileSync(output, "utf8");
    assert.match(svg, /^<svg /);
    assert.match(svg, /data-entity="lander"/);
    assert.match(svg, />Crystals: 0</);
    assert.match(svg, /<image id="asset-crystal" href="data:image\/png;base64,[A-Za-z0-9+/=]+" width="64" height="16"/);
    assert.match(svg, /data-entity="crystal-1" data-frame="\d"/);
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

    // Using a capability without declaring it fails with a stable code.
    const indexPath = join(dir, "index.js");
    writeFileSync(indexPath, readFileSync(indexPath, "utf8").replace('capabilities: ["world.read", "world.write"]', 'capabilities: ["world.read"]'));
    const bad = cli("plugin", "check", dir, "--json");
    assert.equal(bad.code, 1);
    assert.equal(bad.json.checks.find((c: { name: string }) => c.name === "capabilities").passed, false);
    assert.ok(bad.json.diagnostics.some((d: { code: string }) => d.code === "MS4003"));
    assert.equal(cli("plugin", "frobnicate", "--json").code, 2);
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
  });
});
