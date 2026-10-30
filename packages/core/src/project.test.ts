import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOperation, applyOperations } from "./operations.js";
import { validateManifestShape, validateProjectSemantics, validateSceneShape, validateTestShape, type SceneSource } from "./project.js";
import { operationSchema } from "./schema/schemas.js";
import { validateSchema } from "./schema/validate.js";
import { manifest } from "./test-helpers.test.js";

const codes = (ds: { code: string }[]) => ds.map((d) => d.code);

describe("schema validator", () => {
  it("reports type, required, enum and unknown-property issues with paths", () => {
    const schema = {
      type: "object",
      required: ["a"],
      additionalProperties: false,
      properties: { a: { type: "integer" }, b: { enum: ["x", "y"] }, c: { type: "array", items: { type: "string" } } },
    };
    assert.deepEqual(validateSchema(schema, { a: 1, b: "x", c: ["ok"] }), []);
    const issues = validateSchema(schema, { a: 1.5, b: "z", c: ["ok", 3], d: true });
    assert.deepEqual(
      issues.map((i) => i.path),
      ["a", "b", "c[1]", "d"],
    );
    assert.match(validateSchema(schema, {})[0]!.message, /missing required property "a"/);
  });

  it("supports $ref, anyOf, prefixItems and numeric bounds", () => {
    const schema = {
      $defs: { pos: { type: "array", prefixItems: [{ type: "number" }, { type: "number" }], minItems: 2, maxItems: 2 } },
      type: "object",
      properties: { p: { $ref: "#/$defs/pos" }, q: { anyOf: [{ type: "string" }, { type: "null" }] }, r: { type: "number", minimum: 0, maximum: 1 } },
    };
    assert.deepEqual(validateSchema(schema, { p: [1, 2], q: null, r: 0.5 }), []);
    assert.equal(validateSchema(schema, { p: [1, 2, 3], q: 4, r: 2 }).length, 3);
  });
});

describe("project validation", () => {
  it("accepts a well-formed manifest and rejects unknown format versions", () => {
    assert.deepEqual(validateManifestShape(manifest()), []);
    assert.ok(codes(validateManifestShape({ ...manifest(), format: 2 })).includes("MS1004"));
    assert.ok(codes(validateManifestShape({ ...manifest(), nope: 1 })).includes("MS1001"));
  });

  it("validates scene shape", () => {
    assert.deepEqual(validateSceneShape({ format: 1, entities: [{ id: "a", components: { transform: { position: [1, 2] } } }] }), []);
    const issues = validateSceneShape({ format: 1, entities: [{ id: "1bad", components: { shape: { kind: "hexagon" } } }] });
    assert.ok(issues.length >= 2);
    assert.ok(issues.every((d) => d.code === "MS1001"));
  });

  it("finds cross-reference problems with stable codes", () => {
    const m = manifest({
      behaviors: { mover: { source: "behaviors/mover", params: ["speed"], refs: ["target"], state: ["hp"], inputs: ["jump"] } },
    });
    const scene: SceneSource = {
      format: 1,
      camera: "a",
      entities: [
        { id: "a", parent: "b" },
        { id: "b", parent: "a" },
        { id: "a" },
        { id: "c", parent: "ghost" },
        {
          id: "d",
          components: { behavior: { module: "mover", params: { speed: 1, typo: 2 }, refs: { target: "nobody" }, state: { mana: 1 } } },
          extensions: { unknownPlugin: {} },
        },
        { id: "e", components: { behavior: { module: "missing" }, text: { value: "{d.points}" } } },
      ],
    };
    const found = codes(validateProjectSemantics(m, { main: scene }));
    for (const code of ["MS2001", "MS2002", "MS2003", "MS2005", "MS2006", "MS2007", "MS2008", "MS2009", "MS2010", "MS2011", "MS2012"]) {
      assert.ok(found.includes(code), `expected ${code} in ${found.join(",")}`);
    }
  });

  it("validates behavior lists and prefabs", () => {
    const m = manifest({
      behaviors: { a: { source: "a", params: ["x"], prefabs: ["ghost", "spark"] }, b: { source: "b" } },
      prefabs: { spark: { components: { behavior: { module: "a", params: { y: 1 } } } } },
    });
    const scene: SceneSource = {
      format: 1,
      entities: [{ id: "e", components: { behavior: [{ module: "a", params: { x: 1 } }, { module: "b", params: { z: 2 } }] } }],
    };
    const found = validateProjectSemantics(m, { main: scene });
    const byCode = Object.fromEntries(found.map((d) => [`${d.code}:${d.path}`, d]));
    assert.ok(byCode["MS2014:behaviors.a.prefabs"]);
    assert.ok(byCode["MS2006:prefabs.spark.components.behavior.params.y"]);
    assert.ok(byCode["MS2006:entities[0].components.behavior[1].params.z"]);
    assert.equal(found.length, 3);
    assert.deepEqual(validateSceneShape(scene), []);
    // Schema errors inside a list entry point at the entry, not at the anyOf.
    const bad = validateSceneShape({ format: 1, entities: [{ id: "e", components: { behavior: [{ module: "a", oops: 1 }] } }] });
    assert.equal(bad[0]!.path, "entities[0].components.behavior[0].oops");
  });

  it("validates sprite assets and frames", () => {
    const m = manifest({
      assets: { sheet: { path: "a.png", frame: { width: 8, height: 8, columns: 2 } }, sound: { path: "a.ogg" } },
      behaviors: { b: { source: "b", state: ["pose"] } },
    });
    const scene: SceneSource = {
      format: 1,
      entities: [
        { id: "ok", components: { sprite: { asset: "sheet", frame: 1, frameState: "pose" }, behavior: { module: "b" } } },
        { id: "missing", components: { sprite: { asset: "nope" } } },
        { id: "notImage", components: { sprite: { asset: "sound" } } },
        { id: "tooFar", components: { sprite: { asset: "sheet", animation: { fps: 1, frames: [0, 2] } } } },
        { id: "noState", components: { sprite: { asset: "sheet", frameState: "pose" } } },
      ],
    };
    const found = validateProjectSemantics(m, { main: scene }).map((d) => `${d.code}:${d.entity}`);
    assert.deepEqual(found.sort(), ["MS2012:noState", "MS2015:missing", "MS2015:notImage", "MS2015:tooFar"]);
  });

  it("requires exactly one of source or wasm for behaviors", () => {
    const both = manifest({ behaviors: { x: { source: "a", wasm: "b.wasm" } } });
    assert.ok(codes(validateProjectSemantics(both, {})).includes("MS1001"));
  });

  it("validates test files with MS5002", () => {
    assert.deepEqual(validateTestShape({ format: 1, name: "t", ticks: 1, expect: [{ event: "x" }] }), []);
    assert.deepEqual(codes(validateTestShape({ format: 1, name: "t", ticks: 0, expect: [] })), ["MS5002", "MS5002"]);
  });
});

describe("operations", () => {
  const scene: SceneSource = { format: 1, entities: [{ id: "a", components: { transform: { position: [1, 2] } } }, { id: "b", parent: "a" }] };

  it("sets component properties by path without mutating the input", () => {
    const next = applyOperation(scene, { operation: "set_property", target: "a", property: "transform.position.x", value: 300 });
    assert.deepEqual(next.entities[0]!.components!.transform!.position, [300, 2]);
    assert.deepEqual(scene.entities[0]!.components!.transform!.position, [1, 2]);
    const created = applyOperation(scene, { operation: "set_property", target: "b", property: "shape", value: { kind: "circle" } });
    assert.deepEqual(created.entities[1]!.components!.shape, { kind: "circle" });
  });

  it("attaches, detaches and unsets", () => {
    const one = applyOperation(scene, { operation: "attach_behavior", target: "a", behavior: { module: "x" } });
    assert.deepEqual(one.entities[0]!.components!.behavior, { module: "x" });
    const two = applyOperation(one, { operation: "attach_behavior", target: "a", behavior: { module: "y" }, index: 0 });
    assert.deepEqual(two.entities[0]!.components!.behavior, [{ module: "y" }, { module: "x" }]);
    const back = applyOperation(two, { operation: "detach_behavior", target: "a", module: "y" });
    assert.deepEqual(back.entities[0]!.components!.behavior, { module: "x" });
    const none = applyOperation(back, { operation: "detach_behavior", target: "a", module: "x" });
    assert.equal(none.entities[0]!.components!.behavior, undefined);
    assert.throws(() => applyOperation(none, { operation: "detach_behavior", target: "a", module: "x" }), /MS5003/);
    const unset = applyOperation(scene, { operation: "unset_property", target: "a", property: "transform" });
    assert.equal(unset.entities[0]!.components!.transform, undefined);
    assert.equal(applyOperation(scene, { operation: "unset_property", target: "b", property: "parent" }).entities[1]!.parent, undefined);
    assert.throws(() => applyOperation(scene, { operation: "unset_property", target: "a", property: "shape.fill" }), /MS5003/);
  });

  it("reports operation schema errors on the matching operation", () => {
    const issues = validateSchema(operationSchema, { operation: "set_property", target: "a", property: "x" });
    assert.deepEqual(issues.map((i) => i.message), ['missing required property "value"']);
  });

  it("adds and removes entities, detaching children", () => {
    const next = applyOperations(scene, [
      { operation: "add_entity", entity: { id: "c" } },
      { operation: "remove_entity", target: "a" },
    ]);
    assert.deepEqual(next.entities.map((e) => e.id), ["b", "c"]);
    assert.equal(next.entities[0]!.parent, null);
    assert.throws(() => applyOperation(scene, { operation: "remove_entity", target: "zzz" }), /MS5003/);
    assert.throws(() => applyOperation(scene, { operation: "add_entity", entity: { id: "a" } }), /MS2001/);
  });
});
