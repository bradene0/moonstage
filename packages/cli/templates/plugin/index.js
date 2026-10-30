// __NAME__: a Moonstage plugin.
//
// Bobs every entity that carries `extensions.__SLUG__` up and down. Replace the
// body of create() with your own system; keep the shape:
//   - all state lives inside create(), never at module level
//   - use only `ctx` (no Moonstage internals), and declare every capability you use
//   - handle entities that are spawned and removed while the scene runs
//
// Contract: https://github.com/bradene0/moonstage/blob/main/docs/plugins.md

/** @type {import("@moonstage/core").MoonstagePlugin<{ speed?: number }>} */
const plugin = {
  name: "__SLUG__",
  version: "0.0.0",
  pluginApi: 2,
  capabilities: ["world.read", "world.write"],
  description: "Bobs entities with extensions.__SLUG__ up and down.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: { speed: { type: "number", description: "Oscillations per second (default 1)." } },
  },
  extensionSchema: {
    type: "object",
    additionalProperties: false,
    properties: { amplitude: { type: "number", description: "Pixels (default 8)." } },
  },
  create(ctx, config) {
    /** Entities we animate, with their resting y and a random phase. */
    const targets = new Map();
    const track = (id) => {
      targets.set(id, { baseY: ctx.world.transform(id).y, phase: ctx.random() * Math.PI * 2 });
    };
    return {
      start() {
        for (const id of ctx.world.withExtension()) track(id);
      },
      entityAdded(id) {
        if (ctx.world.extension(id) !== undefined) track(id);
      },
      entityRemoved(id) {
        targets.delete(id);
      },
      update() {
        const speed = config.speed ?? 1;
        for (const [id, t] of targets) {
          const amplitude = ctx.world.extension(id)?.amplitude ?? 8;
          const y = t.baseY + Math.sin(ctx.time.elapsed * speed * Math.PI * 2 + t.phase) * Number(amplitude);
          ctx.world.setTransform(id, { y });
        }
      },
      stop() {
        targets.clear();
      },
    };
  },
};

export default plugin;

/** Sample data for `moonstage plugin check` and the conformance test. */
export const conformance = { config: { speed: 2 }, extension: { amplitude: 4 } };
