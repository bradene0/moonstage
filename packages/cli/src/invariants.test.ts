// Repository invariants (see AGENTS.md). These guard the architecture rules
// that are easy to break by accident: dependency direction, a dependency-free
// core, schemas in sync, and published schemas that standard tools accept.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { SCHEMAS } from "@moonstage/core";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const json = (path: string) => JSON.parse(read(path));

function sources(dir: string): string[] {
  return readdirSync(join(repo, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(repo, path)).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("repository invariants", () => {
  it("core has no runtime dependencies", () => {
    const pkg = json("packages/core/package.json");
    assert.deepEqual(pkg.dependencies ?? {}, {});
    assert.deepEqual(pkg.peerDependencies ?? {}, {});
  });

  it("core source uses no Node, DOM or framework APIs", () => {
    const banned = [/from "node:/, /from "(react|three|@rive-app|rapier)/, /\bprocess\./, /\bdocument\./, /\bwindow\./, /\brequire\(/];
    for (const file of sources("packages/core/src")) {
      const text = read(file);
      for (const pattern of banned) assert.doesNotMatch(text, pattern, `${file} matches ${pattern}`);
    }
  });

  it("the player depends only on core and uses no Node APIs", () => {
    assert.deepEqual(Object.keys(json("packages/player/package.json").dependencies), ["@moonstage/core"]);
    for (const file of sources("packages/player/src")) assert.doesNotMatch(read(file), /from "node:/, file);
  });

  it("packages depend in one direction: core <- player <- cli", () => {
    assert.ok(!sources("packages/core/src").some((f) => /@moonstage\/(player|cli)|from "moonstage"/.test(read(f))));
    assert.ok(!sources("packages/player/src").some((f) => /from "moonstage"/.test(read(f))));
  });

  it("every package ships the root license", () => {
    for (const pkg of ["core", "player", "cli"]) assert.equal(read(`packages/${pkg}/LICENSE`), read("LICENSE"), pkg);
  });

  it("published schemas match the canonical schemas in core", () => {
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      assert.deepEqual(json(`schemas/${name}.schema.json`), schema, `schemas/${name}.schema.json is stale; run npm run schemas`);
    }
  });

  it("schemas are standard JSON Schema accepted by Ajv, and the example conforms", async () => {
    const require = createRequire(import.meta.url);
    const Ajv2020 = require("ajv/dist/2020").default;
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const check = (schema: object, file: string) => {
      const validate = ajv.compile(schema);
      assert.ok(validate(json(file)), `${file}: ${JSON.stringify(validate.errors)}`);
    };
    check(SCHEMAS.project, "examples/moon-hopper/moonstage.json");
    check(SCHEMAS.scene, "examples/moon-hopper/scenes/main.scene.json");
    for (const t of readdirSync(join(repo, "examples/moon-hopper/tests"))) check(SCHEMAS.test, `examples/moon-hopper/tests/${t}`);
    check(SCHEMAS.project, "examples/physics-playground/moonstage.json");
    check(SCHEMAS.scene, "examples/physics-playground/scenes/main.scene.json");
    for (const t of readdirSync(join(repo, "examples/physics-playground/tests"))) check(SCHEMAS.test, `examples/physics-playground/tests/${t}`);
    check(SCHEMAS.project, "packages/cli/templates/minimal/moonstage.json");
    check(SCHEMAS.scene, "packages/cli/templates/minimal/scenes/main.scene.json");
  });
});
