/**
 * Canonical JSON Schemas for Moonstage source files. These objects are the
 * single source of truth: the root `schemas/` directory is generated from
 * them (`npm run schemas`) and a test keeps the two in sync.
 */

import type { JsonSchema } from "./validate.js";

const id = {
  type: "string",
  pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
  description: "Stable identifier: a letter followed by letters, digits, '_' or '-'.",
};
const vec2 = {
  type: "array",
  prefixItems: [{ type: "number" }, { type: "number" }],
  minItems: 2,
  maxItems: 2,
  description: "[x, y]",
};
const color = {
  type: "string",
  pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
  description: "Hex color: #rgb, #rrggbb or #rrggbbaa.",
};
const nameList = { type: "array", items: id };
const relativePath = { type: "string", minLength: 1, description: "Path relative to the project root." };
const space = {
  enum: ["world", "screen"],
  description: "'world' (default) is transformed by the camera; 'screen' is fixed to the viewport.",
};

const extensions = {
  type: "object",
  description: "Plugin-owned data keyed by plugin name. Validated by the plugin.",
  additionalProperties: { type: "object" },
};

const behaviorEntry = {
  title: "behavior",
  type: "object",
  required: ["module"],
  additionalProperties: false,
  properties: {
    module: id,
    params: { type: "object", additionalProperties: { type: "number" } },
    refs: { type: "object", additionalProperties: id },
    state: { type: "object", additionalProperties: { type: "number" } },
  },
};

/** Component vocabulary, shared by scene entities and prefabs. */
const components = {
  type: "object",
  additionalProperties: false,
  properties: {
    transform: {
      type: "object",
      additionalProperties: false,
      description: "Position in pixels (y down), rotation in radians (clockwise), scale. Relative to the parent.",
      properties: { position: vec2, rotation: { type: "number" }, scale: vec2 },
    },
    shape: {
      type: "object",
      required: ["kind"],
      additionalProperties: false,
      description: "Basic vector renderable, centered on the entity origin.",
      properties: {
        kind: { enum: ["rect", "circle", "polygon"] },
        size: { ...vec2, description: "rect: [width, height]" },
        radius: { type: "number", minimum: 0, description: "circle radius" },
        points: { type: "array", items: vec2, minItems: 3, description: "polygon points, local space" },
        fill: color,
        stroke: color,
        strokeWidth: { type: "number", minimum: 0 },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        layer: { type: "integer", description: "Draw order; higher draws on top (default 0)." },
        space,
      },
    },
    text: {
      type: "object",
      required: ["value"],
      additionalProperties: false,
      description: "Text renderable. {entityId.stateName} placeholders are replaced with live state values.",
      properties: {
        value: { type: "string" },
        size: { type: "number", exclusiveMinimum: 0 },
        fill: color,
        align: { enum: ["left", "center", "right"] },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        layer: { type: "integer" },
        space,
      },
    },
    behavior: {
      description: "One behavior, or a list of behaviors that run in order. Modules are declared in moonstage.json.",
      anyOf: [
        { $ref: "#/$defs/behaviorEntry" },
        { type: "array", minItems: 1, items: { $ref: "#/$defs/behaviorEntry" } },
      ],
    },
    sprite: {
      type: "object",
      required: ["asset"],
      additionalProperties: false,
      description: "Image renderable from an asset. Draws one frame of a sprite sheet, optionally animated.",
      properties: {
        asset: { ...id, description: "Asset id declared in moonstage.json." },
        size: { ...vec2, description: "Drawn size in pixels (default: frame size, or the image's natural size)." },
        anchor: { ...vec2, description: "Point of the image placed at the entity origin, 0..1 (default [0.5, 0.5])." },
        frame: { type: "integer", minimum: 0, description: "Frame to draw (default 0)." },
        frameState: { ...id, description: "Use this entity state value as the frame; lets behaviors drive it." },
        animation: {
          type: "object",
          required: ["fps"],
          additionalProperties: false,
          description: "Play frames on simulation time, counted from when the entity was created.",
          properties: {
            fps: { type: "number", exclusiveMinimum: 0 },
            frames: { type: "array", items: { type: "integer", minimum: 0 }, minItems: 1, description: "Default: every frame." },
            loop: { type: "boolean", description: "Default true; false holds the last frame." },
          },
        },
        flipX: { type: "boolean" },
        flipY: { type: "boolean" },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        layer: { type: "integer" },
        space,
      },
    },
    camera: {
      type: "object",
      additionalProperties: false,
      description: "The view is centered on this entity's world position.",
      properties: { zoom: { type: "number", exclusiveMinimum: 0 } },
    },
  },
};

export const projectSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Moonstage project manifest (moonstage.json)",
  type: "object",
  required: ["format", "name", "entryScene", "scenes"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    format: { const: 1, description: "Project format version." },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    entryScene: { ...id, description: "Scene loaded first." },
    scenes: {
      type: "object",
      description: "Scene id -> scene file path.",
      additionalProperties: relativePath,
    },
    display: {
      type: "object",
      additionalProperties: false,
      properties: {
        width: { type: "integer", minimum: 1 },
        height: { type: "integer", minimum: 1 },
        background: color,
      },
    },
    simulation: {
      type: "object",
      additionalProperties: false,
      properties: {
        tickRate: { type: "integer", minimum: 1, maximum: 1000, description: "Fixed simulation ticks per second (default 60)." },
        seed: { type: "integer", minimum: 0, description: "Default random seed (default 1)." },
      },
    },
    input: {
      type: "object",
      additionalProperties: false,
      properties: {
        axes: {
          type: "object",
          description: "Axis name -> keys. Axis values range from -1 to 1.",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: {
              negative: { type: "array", items: { type: "string" } },
              positive: { type: "array", items: { type: "string" } },
            },
          },
        },
        buttons: {
          type: "object",
          description: "Button name -> keys (KeyboardEvent.code values). Button values are 0 or 1.",
          additionalProperties: { type: "array", items: { type: "string" } },
        },
      },
    },
    assets: {
      type: "object",
      description: "Asset id -> asset declaration.",
      additionalProperties: {
        type: "object",
        required: ["path"],
        additionalProperties: false,
        properties: {
          path: relativePath,
          type: {
            type: "string",
            description: "'image' (default for .png/.jpg/.jpeg/.gif/.webp/.svg). Plugins may define other types.",
          },
          frame: {
            type: "object",
            required: ["width", "height"],
            additionalProperties: false,
            description: "Sprite sheet layout: equal-size frames in rows, numbered left to right, top to bottom.",
            properties: {
              width: { type: "integer", minimum: 1 },
              height: { type: "integer", minimum: 1 },
              columns: { type: "integer", minimum: 1, description: "Frames per row (default 1)." },
              count: { type: "integer", minimum: 1, description: "Number of frames (default columns)." },
            },
          },
          pixelated: { type: "boolean", description: "Scale without smoothing (pixel art)." },
        },
      },
    },
    behaviors: {
      type: "object",
      description: "Behavior module id -> module interface.",
      additionalProperties: { $ref: "#/$defs/behaviorModule" },
    },
    prefabs: {
      type: "object",
      description: "Prefab name -> entity template that behaviors and plugins can spawn at runtime.",
      additionalProperties: { $ref: "#/$defs/prefab" },
    },
    plugins: {
      type: "object",
      description: "Plugin name -> how to load and configure it.",
      additionalProperties: {
        type: "object",
        required: ["module"],
        additionalProperties: false,
        properties: {
          module: { type: "string", minLength: 1, description: "Project-relative path (./...) or package specifier." },
          config: { type: "object" },
        },
      },
    },
  },
  $defs: {
    behaviorModule: {
      title: "behavior module",
      type: "object",
      additionalProperties: false,
      description:
        "A WebAssembly behavior and its interface. Slot indices used across the ABI follow the order of each list.",
      properties: {
        description: { type: "string" },
        language: { enum: ["moonbit", "wasm"], description: "Default: 'moonbit' when `source` is set, else 'wasm'." },
        source: { ...relativePath, description: "MoonBit package directory, compiled by `moonstage build`." },
        wasm: { ...relativePath, description: "Prebuilt WebAssembly module (any language)." },
        params: { ...nameList, description: "Numeric parameters, read with param(slot)." },
        state: { ...nameList, description: "Numeric per-entity state, read/written with state_get/state_set(entity, slot)." },
        refs: { ...nameList, description: "Entity references, resolved with ref(slot)." },
        inputs: { ...nameList, description: "Input axes/buttons, read with input(slot)." },
        events: { ...nameList, description: "Events this module emits or receives." },
        prefabs: { ...nameList, description: "Prefabs this module can spawn, with spawn(slot)." },
      },
    },
    prefab: {
      title: "prefab",
      type: "object",
      additionalProperties: false,
      description: "An entity template. Spawned copies get generated ids (<prefab>-<n>) and start at the root.",
      properties: {
        name: { type: "string" },
        active: { type: "boolean" },
        components: { $ref: "#/$defs/components" },
        extensions,
      },
    },
    components,
    behaviorEntry,
  },
};

export const sceneSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Moonstage scene (*.scene.json)",
  type: "object",
  required: ["format", "entities"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    format: { const: 1 },
    camera: { ...id, description: "Id of the entity whose camera component drives the view." },
    entities: { type: "array", items: { $ref: "#/$defs/entity" } },
  },
  $defs: {
    entity: {
      title: "entity",
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id,
        name: { type: "string" },
        parent: { anyOf: [id, { type: "null" }] },
        active: { type: "boolean", description: "Inactive entities are not updated or rendered (default true)." },
        components: { $ref: "#/$defs/components" },
        extensions,
      },
    },
    components,
    behaviorEntry,
  },
};

const comparison = {
  equals: { type: ["number", "boolean"] },
  approx: { type: "number" },
  tolerance: { type: "number", minimum: 0 },
  gt: { type: "number" },
  gte: { type: "number" },
  lt: { type: "number" },
  lte: { type: "number" },
};

export const operationSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Moonstage scene operation",
  description: "A semantic edit to a scene. Shared by tests, the CLI and future editor/MCP surfaces.",
  anyOf: [
    {
      title: "set_property",
      type: "object",
      required: ["operation", "target", "property", "value"],
      additionalProperties: false,
      properties: {
        operation: { const: "set_property" },
        target: id,
        property: { type: "string", description: "Component-relative path, e.g. transform.position.x" },
        value: {},
      },
    },
    {
      title: "add_entity",
      type: "object",
      required: ["operation", "entity"],
      additionalProperties: false,
      properties: {
        operation: { const: "add_entity" },
        entity: { type: "object", required: ["id"] },
      },
    },
    {
      title: "remove_entity",
      type: "object",
      required: ["operation", "target"],
      additionalProperties: false,
      properties: { operation: { const: "remove_entity" }, target: id },
    },
    {
      title: "unset_property",
      type: "object",
      required: ["operation", "target", "property"],
      additionalProperties: false,
      properties: {
        operation: { const: "unset_property" },
        target: id,
        property: { type: "string", description: "Component-relative path; a component name removes the component." },
      },
    },
    {
      title: "attach_behavior",
      type: "object",
      required: ["operation", "target", "behavior"],
      additionalProperties: false,
      properties: {
        operation: { const: "attach_behavior" },
        target: id,
        behavior: { $ref: "#/$defs/behaviorEntry" },
        index: { type: "integer", minimum: 0, description: "Position in the behavior list (default: end)." },
      },
    },
    {
      title: "detach_behavior",
      type: "object",
      required: ["operation", "target", "module"],
      additionalProperties: false,
      properties: { operation: { const: "detach_behavior" }, target: id, module: id },
    },
  ],
  $defs: { behaviorEntry },
};

export const testSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Moonstage headless test (tests/*.test.json)",
  type: "object",
  required: ["format", "name", "ticks", "expect"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    format: { const: 1 },
    name: { type: "string", minLength: 1 },
    scene: { ...id, description: "Scene to run (default: entryScene)." },
    seed: { type: "integer", minimum: 0 },
    ticks: { type: "integer", minimum: 1, description: "Fixed simulation ticks to run." },
    setup: { type: "array", items: { $ref: "#/$defs/operation" }, description: "Scene operations applied before loading." },
    input: {
      type: "array",
      description: "Input changes, applied at the start of the given tick and held until changed.",
      items: {
        type: "object",
        required: ["tick", "set"],
        additionalProperties: false,
        properties: {
          tick: { type: "integer", minimum: 0 },
          set: { type: "object", additionalProperties: { type: "number" } },
        },
      },
    },
    expect: { type: "array", minItems: 1, items: { $ref: "#/$defs/assertion" } },
  },
  $defs: {
    operation: operationSchema,
    behaviorEntry,
    assertion: {
      anyOf: [
        {
          title: "event assertion",
          type: "object",
          required: ["event"],
          additionalProperties: false,
          properties: { event: id, count: { type: "object", additionalProperties: false, properties: comparison } },
        },
        {
          title: "property assertion",
          type: "object",
          required: ["target", "property"],
          additionalProperties: false,
          properties: {
            target: id,
            property: { type: "string", description: "transform.position.x, transform.rotation, state.<name>, active" },
            ...comparison,
          },
        },
        {
          title: "prefab count assertion",
          type: "object",
          required: ["prefab"],
          additionalProperties: false,
          properties: {
            prefab: { ...id, description: "Counts live entities spawned from this prefab." },
            count: { type: "object", additionalProperties: false, properties: comparison },
          },
        },
        {
          title: "existence assertion",
          type: "object",
          required: ["target", "exists"],
          additionalProperties: false,
          properties: { target: id, exists: { type: "boolean" } },
        },
      ],
    },
  },
};

export const SCHEMAS = {
  project: projectSchema,
  scene: sceneSchema,
  operation: operationSchema,
  test: testSchema,
} as const;
