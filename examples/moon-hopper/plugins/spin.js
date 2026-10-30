// A minimal project-local plugin: rotates every entity that carries
// `extensions.spin`. It doubles as the smallest example of the plugin contract.

/** @type {import("@moonstage/core").MoonstagePlugin<{ defaultSpeed?: number }>} */
export default {
  name: "spin",
  version: "0.0.0",
  pluginApi: 1,
  capabilities: ["world.read", "world.write"],
  description: "Rotates entities with extensions.spin at `speed` radians per second.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: { defaultSpeed: { type: "number" } },
  },
  extensionSchema: {
    type: "object",
    additionalProperties: false,
    properties: { speed: { type: "number" } },
  },
  create(ctx, config) {
    let targets = [];
    return {
      start() {
        targets = ctx.world.withExtension().map((id) => ({
          id,
          speed: ctx.world.extension(id)?.speed ?? config.defaultSpeed ?? 1,
        }));
      },
      update(dt) {
        for (const { id, speed } of targets) {
          ctx.world.setTransform(id, { rotation: ctx.world.transform(id).rotation + speed * dt });
        }
      },
      stop() {
        targets = [];
      },
    };
  },
};
