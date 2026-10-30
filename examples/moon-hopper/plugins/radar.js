// A drawing plugin (plugin API 4): renders expanding rings around every entity
// that carries `extensions.radar`. It shows how a plugin owns the drawing of
// entities: core places the item (camera, hierarchy, layer), the plugin draws
// it in local coordinates with Canvas 2D in the browser, or as SVG headlessly.

/** @type {import("@moonstage/core").MoonstagePlugin} */
export default {
  name: "radar",
  version: "0.1.0",
  pluginApi: 4,
  draws: true,
  capabilities: ["world.read"],
  description: "Draws pulsing radar rings around entities with extensions.radar.",
  extensionSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      radius: { type: "number", exclusiveMinimum: 0, description: "Outer radius in pixels (default 50)." },
      rings: { type: "integer", minimum: 1, maximum: 8, description: "Rings visible at once (default 3)." },
      speed: { type: "number", exclusiveMinimum: 0, description: "Pulses per second (default 0.5)." },
      color: { type: "string", pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$" },
      layer: { type: "integer" },
      opacity: { type: "number", minimum: 0, maximum: 1 },
    },
  },
  create(ctx) {
    /** Rings for one item at the current simulation time: [radius, alpha][] */
    const rings = (item) => {
      const ext = ctx.world.extension(item.entity) ?? {};
      const radius = Number(ext.radius ?? 50);
      const count = Number(ext.rings ?? 3);
      const phase = (ctx.time.elapsed * Number(ext.speed ?? 0.5)) % 1;
      return {
        color: String(ext.color ?? "#ffffff"),
        list: Array.from({ length: count }, (_, i) => {
          const t = (phase + i / count) % 1;
          return [Math.max(0.5, t * radius), 1 - t];
        }),
      };
    };
    return {
      drawCanvas2d(context, item) {
        const { color, list } = rings(item);
        const base = context.globalAlpha;
        context.strokeStyle = color;
        context.lineWidth = 2;
        for (const [r, alpha] of list) {
          context.globalAlpha = base * alpha;
          context.beginPath();
          context.arc(0, 0, r, 0, Math.PI * 2);
          context.stroke();
        }
      },
      drawSvg(item) {
        const { color, list } = rings(item);
        return list
          .map(([r, alpha]) => `<circle r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="2" opacity="${alpha.toFixed(3)}"/>`)
          .join("");
      },
    };
  },
};

export const conformance = { extension: { radius: 40, rings: 2, color: "#ff6b8b" } };
