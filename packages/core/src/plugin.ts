/**
 * Plugin contract, Plugin API level 4. Level 4 adds drawing: a plugin with
 * `draws: true` renders entities carrying its extension through drawCanvas2d /
 * drawSvg. Earlier history: level 3. Level 2 added spawning/removal and the
 * entityAdded/entityRemoved hooks; level 3 adds async load(), `provides`,
 * component/handle/parent reads and events with a source entity. Plugins
 * targeting levels 1 and 2 keep working unchanged.
 *
 * A plugin is a plain object (usually an ES module's default export) that
 * declares metadata and capabilities and creates an instance per runtime.
 * The instance lifecycle is: create -> start -> update (every tick) -> stop -> dispose.
 *
 * Plugins receive a context exposing only the capabilities they declared.
 * They never touch runtime internals, so core can change freely underneath.
 */

import { diagnostic, MoonstageError, type Diagnostic } from "./diagnostics.js";
import type { ProjectManifest } from "./project.js";
import type { CustomItem } from "./render.js";
import type { JsonSchema } from "./schema/validate.js";
import { MIN_PLUGIN_API, PLUGIN_API } from "./versions.js";
import type { Transform } from "./world.js";

export const CAPABILITIES = {
  "world.read": "Read entities, transforms, state and the plugin's own extension data.",
  "world.write": "Change transforms, state and active flags.",
  events: "Subscribe to and emit events.",
  "input.read": "Read named inputs.",
  audio: "Play sound assets (API 3).",
  saves: "Read and write persistent saved numbers (API 4).",
} as const;

export type Capability = keyof typeof CAPABILITIES;

export interface EventRecord {
  tick: number;
  name: string;
  /** Stable id of the emitting entity, or null when emitted by a plugin or host. */
  source: string | null;
  value: number;
}

export interface PluginContext {
  /** Name this plugin is registered under (also its extension namespace). */
  readonly name: string;
  readonly world: {
    /** Ids of entities active in the hierarchy. */
    entities(): string[];
    /** Ids of entities carrying extension data for this plugin. */
    withExtension(): string[];
    /** This plugin's extension data on an entity. */
    extension(id: string): Readonly<Record<string, unknown>> | undefined;
    transform(id: string): Transform;
    /**
     * Change transform fields. Accepts runtime fields (x, y, rotation, scaleX, scaleY)
     * and the scene-file shape (position: [x, y], scale: [sx, sy] or a number).
     * Unknown keys or non-finite numbers throw MS5003.
     */
    setTransform(id: string, patch: TransformPatch): void;
    state(id: string, name: string): number;
    setState(id: string, name: string, value: number): void;
    active(id: string): boolean;
    setActive(id: string, active: boolean): void;
    /** API 3: a read-only copy of one of the entity's source components (e.g. "physicsBody"). */
    component(id: string, name: string): Readonly<Record<string, unknown>> | undefined;
    /** API 3: the entity's handle, as behaviors see it (for event values). -1 if unknown. */
    handle(id: string): number;
    /** API 3: the entity's parent id, or null. */
    parent(id: string): string | null;
    /** API 2: spawn a prefab; returns the new entity id. Needs world.write. */
    spawn(prefab: string): string;
    /** API 2: remove an entity and its descendants at the end of the tick. Needs world.write. */
    remove(id: string): void;
    /** API 3: switch scenes at the end of the tick. Needs world.write. */
    loadScene(scene: string): void;
  };
  readonly events: {
    on(name: string, listener: (event: EventRecord) => void): () => void;
    /** API 3: `source` (an entity id) lets behaviors tell which entity an event is about. */
    emit(name: string, value?: number, source?: string): void;
  };
  readonly input: { get(name: string): number };
  /** API 3: play a sound asset at volume 0..1. Needs the "audio" capability. */
  readonly audio: { play(asset: string, volume?: number): void };
  /** API 4: persistent saved numbers shared with behaviors. Needs the "saves" capability. */
  readonly saves: { get(key: string): number; set(key: string, value: number): void };
  /** API 3: id of the current scene. On a scene switch, plugins get stop() then start(). */
  readonly scene: string;
  readonly time: { readonly tick: number; readonly elapsed: number; readonly dt: number };
  /** API 2: seeded random number in [0, 1), shared with behaviors. Use it instead of Math.random(). */
  random(): number;
  /** API 3: read-only project settings. */
  readonly project: {
    readonly name: string;
    readonly display: Readonly<ProjectManifest["display"]>;
    readonly simulation: Readonly<ProjectManifest["simulation"]>;
    readonly physics: Readonly<ProjectManifest["physics"]>;
  };
}

/** API 4: what load() can do before the plugin is created. */
export interface PluginLoadContext {
  /** Bytes of a project file (project-relative path), or undefined when missing. */
  readFile(path: string): Promise<Uint8Array | undefined>;
  /** Read-only project settings and declarations. */
  readonly project: Readonly<Pick<ProjectManifest, "name" | "assets" | "display" | "simulation" | "physics">>;
}

/** What plugins may pass to ctx.world.setTransform. */
export type TransformPatch = Partial<Transform> & { position?: [number, number]; scale?: [number, number] | number };

export interface PluginInstance {
  /**
   * API 4 (with `draws: true`): draw one item on a Canvas 2D context. The
   * context is already transformed to the item's local space (pixels, origin at
   * the entity) and its globalAlpha set; `context` is a CanvasRenderingContext2D.
   */
  drawCanvas2d?(context: unknown, item: CustomItem): void;
  /** API 4: SVG markup for one item in the item's local space, for headless renders. */
  drawSvg?(item: CustomItem): string | undefined;
  start?(): void;
  update?(dt: number): void;
  /** API 2: an entity was spawned (called at the end of the tick it was spawned in). */
  entityAdded?(id: string): void;
  /** API 2: an entity was removed (called once per removed entity, descendants included). */
  entityRemoved?(id: string): void;
  stop?(): void;
  dispose?(): void;
}

export interface MoonstagePlugin<Config = Record<string, unknown>> {
  /** Package-style name, e.g. "@moonstage/rive" or "spin". */
  name: string;
  version: string;
  /** Plugin API level this plugin targets. */
  pluginApi: number;
  capabilities: Capability[];
  description?: string;
  /** API 3: services this plugin provides to projects, e.g. ["physics"] or ["renderer"]. */
  provides?: string[];
  /**
   * API 4: this plugin draws every entity that carries its extension data.
   * Core emits a `custom` draw item for each one; the extension may set the
   * common draw fields `layer`, `opacity`, `space` and `size`.
   */
  draws?: boolean;
  /**
   * API 3: asynchronous preparation (e.g. initializing a WebAssembly engine),
   * awaited once per runtime before create(). API 4 passes a context that can
   * read project files (e.g. asset bytes declared under `assets`).
   */
  load?(context: PluginLoadContext): Promise<void>;
  /** Validates the plugin's `config` in moonstage.json. */
  configSchema?: JsonSchema;
  /** Validates `extensions[<name>]` on entities. */
  extensionSchema?: JsonSchema;
  create(context: PluginContext, config: Config): PluginInstance | void;
}

/** Identity helper that gives plugin authors type checking. */
export function definePlugin<Config = Record<string, unknown>>(plugin: MoonstagePlugin<Config>): MoonstagePlugin<Config> {
  return plugin;
}

/** Validate a value claimed to be a plugin. Returns diagnostics; empty means usable. */
export function checkPlugin(value: unknown, registeredAs: string): Diagnostic[] {
  const p = value as Partial<MoonstagePlugin> | null;
  const where = { path: `plugins.${registeredAs}`, file: "moonstage.json" };
  if (
    p === null ||
    typeof p !== "object" ||
    typeof p.name !== "string" ||
    typeof p.version !== "string" ||
    typeof p.pluginApi !== "number" ||
    !Array.isArray(p.capabilities) ||
    typeof p.create !== "function"
  ) {
    return [diagnostic("MS4005", `"${registeredAs}" is not a valid Moonstage plugin`, where)];
  }
  const out: Diagnostic[] = [];
  if (p.name !== registeredAs) {
    out.push(diagnostic("MS4005", `plugin is named "${p.name}" but registered as "${registeredAs}"`, where));
  }
  if (!Number.isInteger(p.pluginApi) || p.pluginApi < MIN_PLUGIN_API || p.pluginApi > PLUGIN_API) {
    out.push(
      diagnostic(
        "MS4002",
        `plugin "${p.name}" targets plugin API ${p.pluginApi}; this runtime supports ${MIN_PLUGIN_API} to ${PLUGIN_API}`,
        where,
      ),
    );
  }
  if (p.provides !== undefined && (!Array.isArray(p.provides) || p.provides.some((x) => typeof x !== "string"))) {
    out.push(diagnostic("MS4005", `plugin "${p.name}" has an invalid "provides" list`, where));
  }
  for (const cap of p.capabilities) {
    if (!(cap in CAPABILITIES)) {
      out.push(diagnostic("MS4005", `plugin "${p.name}" declares unknown capability "${String(cap)}"`, where));
    }
  }
  return out;
}

/** Wrap an API object so every call checks a capability first. */
export function gate<T extends object>(plugin: string, granted: ReadonlySet<Capability>, need: Capability, api: T): T {
  if (granted.has(need)) return api;
  return new Proxy(api, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return () => {
        throw new MoonstageError([
          diagnostic("MS4003", `plugin "${plugin}" used ${need} without declaring the "${need}" capability`),
        ]);
      };
    },
  });
}
