import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InputState, KeyBindings } from "./input.js";
import { createRandom } from "./random.js";
import { manifest } from "./test-helpers.test.js";

describe("key bindings", () => {
  it("maps key codes to named axes and buttons", () => {
    const input = new InputState();
    const keys = new KeyBindings(
      manifest({ input: { axes: { turn: { negative: ["ArrowLeft"], positive: ["ArrowRight"] } }, buttons: { fire: ["Space", "KeyF"] } } }),
      input,
    );
    assert.equal(keys.handles("Space"), true);
    assert.equal(keys.handles("KeyQ"), false);
    keys.press("ArrowLeft");
    keys.press("KeyF");
    assert.deepEqual(input.toJSON(), { turn: -1, fire: 1 });
    keys.press("ArrowRight");
    assert.equal(input.get("turn"), 0);
    keys.releaseAll();
    assert.deepEqual(input.toJSON(), { turn: 0, fire: 0 });
  });
});

describe("button latching", () => {
  it("keeps a tap shorter than a tick visible for one tick", () => {
    const input = new InputState();
    const keys = new KeyBindings(manifest({ input: { buttons: { jump: ["Space"] } } }), input);
    keys.press("Space");
    keys.release("Space");
    assert.equal(input.get("jump"), 1, "tap between ticks still reads as pressed");
    input.endTick();
    assert.equal(input.get("jump"), 0);
  });
});

describe("random", () => {
  it("is reproducible per seed and in [0, 1)", () => {
    const a = createRandom(9);
    const b = createRandom(9);
    const xs = Array.from({ length: 100 }, () => a.next());
    assert.deepEqual(xs, Array.from({ length: 100 }, () => b.next()));
    assert.ok(xs.every((x) => x >= 0 && x < 1));
  });
});
