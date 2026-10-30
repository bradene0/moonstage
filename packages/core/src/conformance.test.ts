import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPluginConformance } from "./conformance.js";
import { definePlugin } from "./plugin.js";

const base = { version: "0.0.0", pluginApi: 2 };
const status = async (plugin: unknown, fixture = {}) =>
  Object.fromEntries((await checkPluginConformance(plugin, fixture)).checks.map((c) => [c.name, c.skipped ? "skipped" : c.passed]));

describe("plugin conformance", () => {
  it("passes a well-behaved plugin that tracks spawned and removed entities", async () => {
    const good = definePlugin({
      ...base,
      name: "good",
      capabilities: ["world.read", "world.write"],
      extensionSchema: { type: "object", required: ["speed"], properties: { speed: { type: "number" } } },
      create(ctx) {
        const ids = new Set<string>();
        return {
          start: () => ctx.world.withExtension().forEach((id) => ids.add(id)),
          entityAdded: (id) => void (ctx.world.extension(id) && ids.add(id)),
          entityRemoved: (id) => void ids.delete(id),
          update: (dt) => {
            for (const id of ids) {
              const speed = ctx.world.extension(id)!.speed as number;
              ctx.world.setTransform(id, { rotation: ctx.world.transform(id).rotation + speed * dt + ctx.random() * 0.01 });
            }
          },
        };
      },
    });
    const report = await checkPluginConformance(good, { extension: { speed: 2 } });
    assert.equal(report.passed, true, JSON.stringify(report.checks));
    assert.deepEqual(report.checks.map((c) => c.name), ["definition", "schemas", "capabilities", "lifecycle", "reload"]);
  });

  it("flags each kind of contract violation", async () => {
    assert.deepEqual(await status({ name: "x" }), { definition: false });

    const strictSchema = definePlugin({ ...base, name: "s", capabilities: [], extensionSchema: { type: "object", required: ["speed"] }, create: () => {} });
    assert.equal((await status(strictSchema)).schemas, false, "fixture must satisfy the extension schema");

    const sneaky = definePlugin({ ...base, name: "sneaky", capabilities: [], create: (ctx) => ({ update: () => void ctx.world.entities() }) });
    assert.deepEqual(await status(sneaky), { definition: true, schemas: true, capabilities: false, lifecycle: "skipped", reload: "skipped" });

    const fragile = definePlugin({
      ...base,
      name: "fragile",
      capabilities: ["world.read"],
      create: (ctx) => {
        const ids = new Set<string>();
        return { entityAdded: (id) => void ids.add(id), update: () => ids.forEach((id) => ctx.world.transform(id)) };
      },
    });
    assert.equal((await status(fragile)).lifecycle, false, "must stop using removed entities");

    let leaked = 0;
    const leaky = definePlugin({
      ...base,
      name: "leaky",
      capabilities: ["world.write"],
      create: (ctx) => ({ update: () => ctx.world.setTransform("plain", { x: ++leaked }) }),
    });
    assert.equal((await status(leaky)).reload, false, "module-level state breaks reloads");

    const random = definePlugin({
      ...base,
      name: "random",
      capabilities: ["world.write"],
      create: (ctx) => ({ update: () => ctx.world.setTransform("plain", { x: Math.random() }) }),
    });
    assert.equal((await status(random)).reload, false, "Math.random() breaks determinism");
  });
});
