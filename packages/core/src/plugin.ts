/**
 * Plugin contract, Plugin API level 2. Level 2 adds spawning/removal and the
 * entityAdded/entityRemoved hooks; level 1 plugins keep working unchanged.
 *
 * A plugin is a plain object (usually an ES module's default export) that
 * declares metadata and capabilities and creates an instance per runtime.
 * The instance lifecycle is: create -> start -> update (every tick) -> stop -> dispose.
 *
 * Plugins receive a context exposing only the capabilities they declared.
 * They never touch runtime internals, so core can change freely underneath.
 */

import { diagnostic, MoonstageError, type Diagnostic } from "./diagnostics.js";
import type { JsonSchema } from "./schema/validate.js";
import { MIN_PLUGIN_API, PLUGIN_API } from "./versions.js";
import type { Transform } from "./world.js";

export const CAPABILITIES = {
  "world.read": "Read entities, transforms, state and the plugin's own extension data.",
  "world.write": "Change transforms, state and active flags.",
  events: "Subscribe to and emit events.",
  "input.read": "Read named inputs.",
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
    setTransform(id: string, patch: Partial<Transform>): void;
    state(id: string, name: string): number;
    setState(id: string, name: string, value: number): void;
    active(id: string): boolean;
    setActive(id: string, active: boolean): void;
    /** API 2: spawn a prefab; returns the new entity id. Needs world.write. */
    spawn(prefab: string): string;
    /** API 2: remove an entity and its descendants at the end of the tick. Needs world.write. */
    remove(id: string): void;
  };
  readonly events: {
    on(name: string, listener: (event: EventRecord) => void): () => void;
    emit(name: string, value?: number): void;
  };
  readonly input: { get(name: string): number };
  readonly time: { readonly tick: number; readonly elapsed: number; readonly dt: number };
}

export interface PluginInstance {
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
