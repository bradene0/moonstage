import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slotCollisions, slotsSource, snakeCase } from "./slots.js";

describe("generated slots", () => {
  it("converts declared names to snake_case", () => {
    assert.equal(snakeCase("turnSpeed"), "turn_speed");
    assert.equal(snakeCase("minX"), "min_x");
    assert.equal(snakeCase("pickup-radius"), "pickup_radius");
    assert.equal(snakeCase("HPMax"), "hp_max");
    assert.equal(snakeCase("vx"), "vx");
  });

  it("emits one constant per declared name, indexed by list order", () => {
    const text = slotsSource("crystal", { params: ["pickupRadius", "value"], state: ["phase"], refs: ["lander"], events: ["collected"] });
    assert.match(text, /pub let param_pickup_radius : Int32 = 0/);
    assert.match(text, /pub let param_value : Int32 = 1/);
    assert.match(text, /pub let state_phase : Int32 = 0/);
    assert.match(text, /pub let ref_lander : Int32 = 0/);
    assert.match(text, /pub let event_collected : Int32 = 0/);
    assert.doesNotMatch(slotsSource("empty", {}), /pub let/);
  });

  it("reports names that collide after conversion", () => {
    const found = slotCollisions({
      format: 1,
      name: "x",
      entryScene: "main",
      scenes: {},
      behaviors: { b: { source: "behaviors/b", params: ["minX", "min_x"] } },
    });
    assert.equal(found[0]?.code, "MS2013");
  });
});

describe("MoonBit compiler hints", async () => {
  const { compilerHint } = await import("./moonbit.js");
  it("explains the mistakes newcomers make", () => {
    assert.match(compilerHint(4059, "Cannot define method foo for foreign type Int")!, /`entity`/);
    assert.match(compilerHint(4021, "The value identifier param_spede is unbound.")!, /param_spede.*moonstage\.json/);
    assert.match(compilerHint(4021, "The value identifier Math is unbound.")!, /@math/);
    assert.match(compilerHint(4014, "Expr Type Mismatch\n has type : Int\n wanted : Double")!, /to_double/);
    assert.match(compilerHint(4014, "Expr Type Mismatch\n has type : Int\n wanted : Unit")!, /ignore/);
    assert.match(compilerHint(4087, "The variable x is not mutable.")!, /let mut/);
    assert.equal(compilerHint(1, "anything"), undefined);
  });
});
