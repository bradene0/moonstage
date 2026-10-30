/**
 * The Moonstage runtime: owns one loaded scene and advances it with a fixed
 * simulation timestep. It has no DOM or Node dependencies; platforms (the
 * browser player, the CLI) drive it and render its frames.
 *
 * Tick order:
 *   1. remember previous transforms (for render interpolation)
 *   2. behavior ms_update for every active entity, in entity order, and for
 *      each entity in the order its behaviors are listed
 *   3. plugin update, in manifest order
 *   4. event dispatch (behaviors that declare the event, then plugin listeners)
 *   5. lifecycle: ms_start and entityAdded for entities spawned this tick,
 *      then removal (entityRemoved) of entities marked for removal
 *
 * Entities spawned during a tick exist immediately (their handle and transform
 * are usable) but are started at step 5 and first updated on the next tick.
 */

import {
  behaviorInterface,
  instantiateBehavior,
  type BehaviorExports,
  type BehaviorInterface,
  type BehaviorSource,
  type HostFunctions,
  type WasmApi,
} from "./behavior.js";
import { diagnostic, hasErrors, MoonstageError, type Diagnostic } from "./diagnostics.js";
import { InputState } from "./input.js";
import { parsePropertyPath } from "./operations.js";
import {
  checkPlugin,
  gate,
  type Capability,
  type EventRecord,
  type MoonstagePlugin,
  type PluginContext,
  type PluginInstance,
  type PluginLoadContext,
  type TransformPatch,
} from "./plugin.js";
import { behaviorsOf, type ProjectManifest, type SceneSource } from "./project.js";
import { createRandom, type Random } from "./random.js";
import { buildFrame, type RenderFrame } from "./render.js";
import { validateSchema } from "./schema/validate.js";
import { TRANSFORM_FIELDS, World, type Entity, type Transform } from "./world.js";

/** Everything a runtime needs, already read from disk or network by a loader. */
export interface LoadedProject {
  manifest: ProjectManifest;
  scenes: Record<string, SceneSource>;
  behaviors: Record<string, BehaviorSource>;
  plugins: Record<string, MoonstagePlugin<any>>;
  /** Reads project files for plugin load(); loaders provide it. */
  readFile?: (path: string) => Promise<Uint8Array | undefined>;
}

/** Where saved numbers persist. The browser player uses localStorage; headless runs keep them in memory. */
export interface SaveStorage {
  load(): Record<string, number>;
  store(values: Record<string, number>): void;
}

export interface RuntimeOptions {
  /** Persistence for save_get / save_set (default: in memory for this runtime). */
  storage?: SaveStorage;
  /** Scene id (default: manifest.entryScene). */
  scene?: string;
  /** Use this scene source instead of the loaded one (e.g. after test setup operations). */
  sceneSource?: SceneSource;
  seed?: number;
  wasm?: WasmApi;
  /** Maximum event dispatch rounds per tick (events emitted while handling events). */
  maxEventRounds?: number;
}

/** JSON-serializable view of runtime state, used by tests and `moonstage run --json`. */
export interface Snapshot {
  tick: number;
  elapsed: number;
  entities: Record<string, { active: boolean; transform: Transform; state: Record<string, number>; prefab?: string }>;
}

/** A sound a behavior or plugin asked to play. Platforms play it; core only records it. */
export interface SoundRequest {
  tick: number;
  /** Asset id. */
  asset: string;
  /** 0..1 */
  volume: number;
  /** Entity that asked, or null for plugins. */
  source: string | null;
}

interface BehaviorBinding {
  module: string;
  exports: BehaviorExports;
  iface: BehaviorInterface;
  params: Float64Array;
  refs: Int32Array;
  disabled: boolean;
}

interface Module {
  exports: BehaviorExports;
  iface: BehaviorInterface;
}

const TRANSFORM_KEYS = new Set(["x", "y", "rotation", "scaleX", "scaleY"]);

/**
 * Turn a plugin's transform patch into runtime fields. The scene-file shape
 * (position/scale arrays) is accepted because that is what authors and agents
 * naturally write; anything else is an error rather than silently ignored.
 */
function normalizeTransformPatch(id: string, patch: TransformPatch): Partial<Transform> {
  const out: Partial<Record<keyof Transform, number>> = {};
  const fail = (message: string) =>
    new MoonstageError([
      diagnostic("MS5003", `setTransform("${id}"): ${message}`, {
        entity: id,
        hint: "Use x, y, rotation, scaleX, scaleY, or position: [x, y] and scale: [sx, sy] (or a number).",
      }),
    ]);
  const num = (key: string, value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw fail(`${key} must be a finite number`);
    return value;
  };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (TRANSFORM_KEYS.has(key)) out[key as keyof Transform] = num(key, value);
    else if (key === "position") {
      if (!Array.isArray(value) || value.length !== 2) throw fail("position must be [x, y]");
      out.x = num("position[0]", value[0]);
      out.y = num("position[1]", value[1]);
    } else if (key === "scale") {
      if (typeof value === "number") out.scaleX = out.scaleY = num("scale", value);
      else if (Array.isArray(value) && value.length === 2) {
        out.scaleX = num("scale[0]", value[0]);
        out.scaleY = num("scale[1]", value[1]);
      } else throw fail("scale must be [sx, sy] or a number");
    } else throw fail(`unknown transform field "${key}"`);
  }
  return out;
}

/** Which lifecycle export a behavior call runs. */
const enum Call {
  Start,
  Update,
  Event,
}

const MAX_CATCH_UP_TICKS = 5;
const MAX_LOGGED_EVENTS = 10_000;
/** Spawn chains (ms_start spawning more entities) settle within this many rounds per tick. */
const MAX_LIFECYCLE_ROUNDS = 8;

export class Runtime {
  readonly manifest: ProjectManifest;
  /** Current scene id; changes when a scene switch completes. */
  sceneId: string;
  scene: SceneSource;
  world: World;
  private readonly project: LoadedProject;
  readonly input = new InputState();
  readonly tickRate: number;
  readonly dt: number;
  readonly random: Random;
  /** Problems found while running (traps, logs). Grows over time. */
  readonly diagnostics: Diagnostic[] = [];
  /** Every event dispatched, oldest first (capped at 10,000; see eventTotals for exact counts). */
  readonly events: EventRecord[] = [];
  /** Exact number of dispatches per event name, never capped. */
  readonly eventTotals = new Map<string, number>();
  /** Values passed to the behavior `log` host function. */
  readonly logs: { tick: number; entity: string; value: number }[] = [];
  /** Every sound requested, oldest first (capped). Platforms play them; tests count them. */
  readonly sounds: SoundRequest[] = [];
  /** Scenes entered, including the first, with the tick they started at. */
  readonly sceneHistory: { tick: number; scene: string }[] = [];
  private unplayed: SoundRequest[] = [];
  private pendingScene: string | undefined;
  /** Saved numbers; written back to storage at the end of a tick that changed them. */
  readonly saves: Map<string, number>;
  private savesDirty = false;
  private readonly storage: SaveStorage | undefined;
  private switchesThisTick = 0;

  tick = 0;
  elapsed = 0;
  private started = false;
  private accumulator = 0;
  /** Entity and binding currently executing behavior code. */
  private current = -1;
  private currentBinding: BehaviorBinding | undefined;
  private pending: EventRecord[] = [];
  private spawned: Entity[] = [];
  private readonly removing = new Set<number>();
  private readonly modules = new Map<string, Module>();
  private readonly bindings = new Map<number, BehaviorBinding[]>();
  private readonly eventIndex = new Map<string, { handle: number; binding: BehaviorBinding; slot: number }[]>();
  private readonly plugins: { name: string; instance: PluginInstance }[] = [];
  /** Names of plugins that draw entities carrying their extension (API 4), in manifest order. */
  readonly drawingPlugins: string[] = [];
  private readonly listeners = new Map<string, Set<(e: EventRecord) => void>>();
  private readonly maxEventRounds: number;

  private constructor(project: LoadedProject, options: RuntimeOptions) {
    this.manifest = project.manifest;
    this.project = project;
    this.sceneId = options.scene ?? project.manifest.entryScene;
    const scene = options.sceneSource ?? project.scenes[this.sceneId];
    if (scene === undefined) {
      throw new MoonstageError([diagnostic("MS2004", `scene "${this.sceneId}" is not loaded`)]);
    }
    this.scene = scene;
    this.world = new World(scene);
    this.tickRate = project.manifest.simulation?.tickRate ?? 60;
    this.dt = 1 / this.tickRate;
    this.random = createRandom(options.seed ?? project.manifest.simulation?.seed ?? 1);
    this.maxEventRounds = options.maxEventRounds ?? 8;
    this.storage = options.storage;
    let stored: Record<string, number> = {};
    try {
      stored = options.storage?.load() ?? {};
    } catch {
      // Unreadable storage behaves like an empty one.
    }
    this.saves = new Map(Object.entries(stored).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
    this.sceneHistory.push({ tick: 0, scene: this.sceneId });
  }

  /** Create a runtime: instantiate behaviors and plugins for the chosen scene. */
  static async create(project: LoadedProject, options: RuntimeOptions = {}): Promise<Runtime> {
    const rt = new Runtime(project, options);
    await rt.instantiateBehaviors(project, options.wasm);
    const loadContext: PluginLoadContext = {
      readFile: project.readFile ?? (async () => undefined),
      project: Object.freeze({
        name: project.manifest.name,
        assets: project.manifest.assets,
        display: project.manifest.display,
        simulation: project.manifest.simulation,
        physics: project.manifest.physics,
      }),
    };
    for (const name of Object.keys(project.manifest.plugins ?? {})) await project.plugins[name]?.load?.(loadContext);
    rt.createPlugins(project);
    return rt;
  }

  private async instantiateBehaviors(project: LoadedProject, wasm: WasmApi | undefined): Promise<void> {
    const decls = project.manifest.behaviors ?? {};
    // Modules used by scene entities, plus any a prefab could bring in at runtime.
    const used = new Set([
      ...this.world.entities.flatMap((e) => behaviorsOf(e.components).map((b) => b.module)),
      ...Object.values(project.scenes).flatMap((s) => s.entities.flatMap((e) => behaviorsOf(e.components).map((b) => b.module))),
      ...Object.values(project.manifest.prefabs ?? {}).flatMap((p) => behaviorsOf(p.components).map((b) => b.module)),
    ]);
    const problems: Diagnostic[] = [];

    for (const name of used) {
      const decl = decls[name];
      const source = project.behaviors[name];
      if (decl === undefined) {
        problems.push(diagnostic("MS2005", `behavior module "${name}" is not declared`));
        continue;
      }
      if (source === undefined) {
        problems.push(diagnostic("MS3001", `behavior module "${name}" has not been built`));
        continue;
      }
      const iface = behaviorInterface(decl);
      try {
        const exports = await instantiateBehavior(name, source, { moonstage: this.hostFunctions(iface) }, wasm);
        this.modules.set(name, { exports, iface });
      } catch (err) {
        if (err instanceof MoonstageError) problems.push(...err.diagnostics);
        else problems.push(diagnostic("MS3007", `behavior "${name}" failed to instantiate: ${String(err)}`));
      }
    }
    if (hasErrors(problems)) throw new MoonstageError(problems);
    for (const entity of this.world.entities) this.bind(entity);
  }

  /** Create behavior bindings for an entity. Refs resolve against the world as it is now. */
  private bind(entity: Entity): void {
    const list = behaviorsOf(entity.components).map((component): BehaviorBinding => {
      const mod = this.modules.get(component.module)!;
      return {
        module: component.module,
        exports: mod.exports,
        iface: mod.iface,
        params: Float64Array.from(mod.iface.params, (p) => component.params?.[p] ?? 0),
        refs: Int32Array.from(mod.iface.refs, (r) => {
          const target = component.refs?.[r];
          return target === undefined ? -1 : this.world.handle(target);
        }),
        disabled: false,
      };
    });
    if (list.length > 0) {
      this.bindings.set(entity.handle, list);
      this.eventIndex.clear();
    }
  }

  private entityAt(handle: number): Entity {
    const entity = this.world.get(handle);
    if (entity === undefined) throw new Error(`invalid entity handle ${handle}`);
    return entity;
  }

  /** Live and not marked for removal (an ancestor being removed counts too). */
  private exists(handle: number): boolean {
    for (let e = this.world.get(handle); e !== undefined; e = this.world.get(e.parent)) {
      if (this.removing.has(e.handle)) return false;
    }
    return this.world.get(handle) !== undefined;
  }

  private slotName(list: string[], slot: number, kind: string): string {
    const name = list[slot];
    if (name === undefined) throw new Error(`invalid ${kind} slot ${slot}`);
    return name;
  }

  /** Host functions for one behavior module (slot tables are per module). */
  private hostFunctions(iface: BehaviorInterface): HostFunctions {
    const binding = () => this.currentBinding!;
    return {
      transform_get: (entity, field) =>
        this.entityAt(entity).transform[TRANSFORM_FIELDS[field] ?? this.badField(field)],
      transform_set: (entity, field, value) => {
        this.entityAt(entity).transform[TRANSFORM_FIELDS[field] ?? this.badField(field)] = value;
      },
      state_get: (entity, slot) => this.entityAt(entity).state.get(this.slotName(iface.state, slot, "state")) ?? 0,
      state_set: (entity, slot, value) => {
        this.entityAt(entity).state.set(this.slotName(iface.state, slot, "state"), value);
      },
      param: (slot) => binding().params[slot] ?? this.badSlot("param", slot),
      ref: (slot) => binding().refs[slot] ?? this.badSlot("ref", slot),
      input: (slot) => this.input.get(this.slotName(iface.inputs, slot, "input")),
      emit: (event, value) =>
        this.queueEvent(this.slotName(iface.events, event, "event"), this.world.get(this.current)?.id ?? null, value),
      random: () => this.random.next(),
      time: () => this.elapsed,
      entity_active: (entity) => (this.entityAt(entity).active ? 1 : 0),
      entity_set_active: (entity, active) => {
        this.entityAt(entity).active = active !== 0;
      },
      log: (value) => {
        this.logs.push({ tick: this.tick, entity: this.world.get(this.current)?.id ?? "", value });
      },
      spawn: (slot) => this.spawn(this.slotName(iface.prefabs, slot, "prefab")).handle,
      remove: (entity) => {
        this.entityAt(entity);
        this.removing.add(entity);
      },
      entity_exists: (entity) => (this.exists(entity) ? 1 : 0),
      load_scene: (slot) => this.requestScene(this.slotName(iface.scenes, slot, "scene")),
      play_sound: (slot, volume) =>
        this.playSound(this.slotName(iface.sounds, slot, "sound"), volume, this.world.get(this.current)?.id ?? null),
      save_get: (slot) => this.saves.get(this.slotName(iface.saves, slot, "save")) ?? 0,
      save_set: (slot, value) => this.setSave(this.slotName(iface.saves, slot, "save"), value),
      is_prefab: (entity, slot) => (this.entityAt(entity).prefab === this.slotName(iface.prefabs, slot, "prefab") ? 1 : 0),
    };
  }

  private badField(field: number): never {
    throw new Error(`invalid transform field ${field}`);
  }

  private badSlot(kind: string, slot: number): never {
    throw new Error(`invalid ${kind} slot ${slot}`);
  }

  /** Switch scenes at the end of the current tick. The last request in a tick wins. */
  private requestScene(scene: string): void {
    if (this.project.scenes[scene] === undefined) throw new Error(`scene "${scene}" is not loaded`);
    this.pendingScene = scene;
  }

  private playSound(asset: string, volume: number, source: string | null): void {
    if (this.manifest.assets?.[asset] === undefined) throw new Error(`unknown sound asset "${asset}"`);
    const request = { tick: this.tick, asset, volume: Math.max(0, Math.min(1, volume)), source };
    if (this.sounds.length < MAX_LOGGED_EVENTS) this.sounds.push(request);
    this.unplayed.push(request);
  }

  private setSave(name: string, value: number): void {
    if (!Number.isFinite(value)) throw new Error(`save "${name}" must be a finite number`);
    if (this.saves.get(name) === value) return;
    this.saves.set(name, value);
    this.savesDirty = true;
  }

  /** Write changed saves to storage. Called at the end of every tick. */
  private flushSaves(): void {
    if (!this.savesDirty) return;
    this.savesDirty = false;
    try {
      this.storage?.store(Object.fromEntries(this.saves));
    } catch {
      // Storage full or unavailable: keep playing with in-memory saves.
    }
  }

  /** Sounds requested since the last call. Platforms call this after advancing and play them. */
  drainSounds(): SoundRequest[] {
    const out = this.unplayed;
    this.unplayed = [];
    return out;
  }

  /** Spawn a prefab now; it is started at the end of the tick. */
  private spawn(prefabName: string): Entity {
    const prefab = this.manifest.prefabs?.[prefabName];
    if (prefab === undefined) throw new Error(`unknown prefab "${prefabName}"`);
    const entity = this.world.spawn(prefabName, prefab);
    entity.born = this.tick;
    this.bind(entity);
    this.spawned.push(entity);
    return entity;
  }

  private createPlugins(project: LoadedProject): void {
    const problems: Diagnostic[] = [];
    for (const [name, decl] of Object.entries(project.manifest.plugins ?? {})) {
      const plugin = project.plugins[name];
      if (plugin === undefined) {
        problems.push(diagnostic("MS4001", `plugin "${name}" was not loaded`, { path: `plugins.${name}` }));
        continue;
      }
      const checks = checkPlugin(plugin, name);
      const config = decl.config ?? {};
      if (plugin.configSchema) {
        for (const issue of validateSchema(plugin.configSchema, config)) {
          checks.push(diagnostic("MS4004", `plugins.${name}.config ${issue.path}: ${issue.message}`, { path: `plugins.${name}.config` }));
        }
      }
      if (plugin.extensionSchema) {
        const carriers = [
          ...this.world.entities.map((e) => [e.id, e.extensions[name]] as const),
          ...Object.entries(project.manifest.prefabs ?? {}).map(([p, prefab]) => [`prefab ${p}`, prefab.extensions?.[name]] as const),
        ];
        for (const [who, data] of carriers) {
          if (data === undefined) continue;
          for (const issue of validateSchema(plugin.extensionSchema, data)) {
            checks.push(diagnostic("MS4004", `extensions.${name} ${issue.path}: ${issue.message}`, { entity: who }));
          }
        }
      }
      if (hasErrors(checks)) {
        problems.push(...checks);
        continue;
      }
      const instance = plugin.create(this.pluginContext(name, new Set(plugin.capabilities)), config) ?? {};
      this.plugins.push({ name, instance });
      if (plugin.draws === true) this.drawingPlugins.push(name);
    }
    if (hasErrors(problems)) throw new MoonstageError(problems);
  }

  private pluginContext(name: string, granted: ReadonlySet<Capability>): PluginContext {
    const entity = (id: string) => {
      const e = this.world.byStableId(id);
      if (e === undefined) throw new MoonstageError([diagnostic("MS5003", `entity "${id}" does not exist`, { entity: id })]);
      return e;
    };
    const read = gate(name, granted, "world.read", {
      entities: () => this.world.entities.filter((e) => this.world.activeInHierarchy(e.handle)).map((e) => e.id),
      withExtension: () => this.world.entities.filter((e) => name in e.extensions).map((e) => e.id),
      extension: (id: string) => entity(id).extensions[name],
      transform: (id: string) => ({ ...entity(id).transform }),
      state: (id: string, key: string) => entity(id).state.get(key) ?? 0,
      active: (id: string) => entity(id).active,
      component: (id: string, component: string) => {
        const value = (entity(id).components as Record<string, unknown>)[component];
        return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
      },
      handle: (id: string) => this.world.handle(id),
      parent: (id: string) => this.world.get(entity(id).parent)?.id ?? null,
    });
    const write = gate(name, granted, "world.write", {
      setTransform: (id: string, patch: TransformPatch) => void Object.assign(entity(id).transform, normalizeTransformPatch(id, patch)),
      setState: (id: string, key: string, value: number) => void entity(id).state.set(key, value),
      setActive: (id: string, active: boolean) => void (entity(id).active = active),
      spawn: (prefab: string) => {
        if (this.manifest.prefabs?.[prefab] === undefined) {
          throw new MoonstageError([diagnostic("MS2014", `prefab "${prefab}" is not declared`)]);
        }
        return this.spawn(prefab).id;
      },
      remove: (id: string) => void this.removing.add(entity(id).handle),
      loadScene: (scene: string) => {
        if (this.project.scenes[scene] === undefined) {
          throw new MoonstageError([diagnostic("MS2004", `scene "${scene}" is not loaded`)]);
        }
        this.pendingScene = scene;
      },
    });
    const rt = this;
    return {
      name,
      world: { ...read, ...write },
      events: gate(name, granted, "events", {
        on: (event: string, listener: (e: EventRecord) => void) => {
          const set = this.listeners.get(event) ?? new Set();
          set.add(listener);
          this.listeners.set(event, set);
          return () => void set.delete(listener);
        },
        emit: (event: string, value = 0, source?: string) => this.queueEvent(event, source ?? null, value),
      }),
      input: gate(name, granted, "input.read", { get: (input: string) => this.input.get(input) }),
      audio: gate(name, granted, "audio", {
        play: (asset: string, volume = 1) => {
          if (this.manifest.assets?.[asset] === undefined) {
            throw new MoonstageError([diagnostic("MS2017", `sound asset "${asset}" is not declared`)]);
          }
          this.playSound(asset, volume, null);
        },
      }),
      get scene() {
        return rt.sceneId;
      },
      saves: gate(name, granted, "saves", {
        get: (key: string) => this.saves.get(key) ?? 0,
        set: (key: string, value: number) => this.setSave(key, value),
      }),
      time: {
        get tick() {
          return rt.tick;
        },
        get elapsed() {
          return rt.elapsed;
        },
        dt: this.dt,
      },
      random: () => this.random.next(),
      project: Object.freeze({
        name: this.manifest.name,
        display: this.manifest.display,
        simulation: this.manifest.simulation,
        physics: this.manifest.physics,
      }),
    };
  }

  private queueEvent(name: string, source: string | null, value: number): void {
    this.pending.push({ tick: this.tick, name, source, value });
  }

  /**
   * Run one lifecycle export of a behavior, converting traps into diagnostics
   * and disabling the binding. Hot path: no closures or temporary arrays.
   */
  private call(handle: number, binding: BehaviorBinding, kind: Call, slot = 0, source = -1, value = 0): void {
    if (binding.disabled) return;
    const outerEntity = this.current;
    const outerBinding = this.currentBinding;
    this.current = handle;
    this.currentBinding = binding;
    try {
      if (kind === Call.Update) binding.exports.ms_update(handle, this.dt);
      else if (kind === Call.Event) binding.exports.ms_event(handle, slot, source, value);
      else binding.exports.ms_start(handle);
    } catch (err) {
      binding.disabled = true;
      const entity = this.world.get(handle);
      this.diagnostics.push(
        diagnostic(
          "MS3004",
          `behavior "${binding.module}" on "${entity?.id}" trapped at tick ${this.tick}: ${err instanceof Error ? err.message : String(err)}`,
          { entity: entity?.id ?? String(handle), component: "behavior" },
        ),
      );
    } finally {
      this.current = outerEntity;
      this.currentBinding = outerBinding;
    }
  }

  /** Run `kind` for every binding of every live, active entity in `entities`, in order. */
  private callAll(entities: readonly Entity[], kind: Call): void {
    for (const e of entities) {
      const list = this.bindings.get(e.handle);
      if (list === undefined || !this.exists(e.handle) || !this.world.activeInHierarchy(e.handle)) continue;
      for (const b of list) this.call(e.handle, b, kind);
    }
  }



  /** Call ms_start on behaviors and start plugins. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.callAll([...this.world.entities], Call.Start);
    for (const p of this.plugins) p.instance.start?.();
    this.dispatchEvents();
    this.settleLifecycle();
  }

  /** Advance exactly one fixed simulation tick. */
  step(): void {
    this.start();
    this.tick += 1;
    this.elapsed = this.tick * this.dt;
    this.switchesThisTick = 0;
    this.world.snapshotPrevious();
    // Entities spawned during this tick are not updated until the next one.
    this.callAll([...this.world.entities], Call.Update);
    for (const p of this.plugins) p.instance.update?.(this.dt);
    this.dispatchEvents();
    this.settleLifecycle();
    this.flushSaves();
    this.input.endTick();
  }

  /** Start entities spawned this tick, then remove entities marked for removal. */
  private settleLifecycle(): void {
    for (let round = 0; round < MAX_LIFECYCLE_ROUNDS && this.spawned.length > 0; round++) {
      const batch = this.spawned;
      this.spawned = [];
      for (const e of batch) e.previous = { ...e.transform }; // no interpolation from the prefab origin
      this.callAll(batch, Call.Start);
      for (const e of batch) {
        if (this.world.get(e.handle) === undefined) continue;
        for (const p of this.plugins) p.instance.entityAdded?.(e.id);
      }
      this.dispatchEvents();
    }
    if (this.removing.size > 0) {
      const removed = this.world.remove(this.removing);
      this.removing.clear();
      for (const e of removed) {
        if (this.bindings.delete(e.handle)) this.eventIndex.clear();
        for (const p of this.plugins) p.instance.entityRemoved?.(e.id);
      }
    }
    if (this.pendingScene !== undefined) {
      if (this.switchesThisTick >= MAX_LIFECYCLE_ROUNDS) {
        this.diagnostics.push(diagnostic("MS3004", `scene switches did not settle within one tick (last: "${this.pendingScene}")`));
        this.pendingScene = undefined;
        return;
      }
      this.switchesThisTick += 1;
      this.switchScene(this.pendingScene);
    }
  }


  /**
   * Replace the world with a fresh copy of `scene`. Behaviors start again
   * (ms_start), plugins are stopped and started, pending events are dropped.
   * Module instances and the random generator carry over.
   */
  private switchScene(sceneId: string): void {
    this.pendingScene = undefined;
    for (const p of this.plugins) p.instance.stop?.();
    for (const e of this.world.entities) for (const p of this.plugins) p.instance.entityRemoved?.(e.id);
    this.bindings.clear();
    this.eventIndex.clear();
    this.removing.clear();
    this.spawned = [];
    this.pending = [];
    this.sceneId = sceneId;
    this.scene = this.project.scenes[sceneId]!;
    this.world = new World(this.scene);
    for (const e of this.world.entities) {
      e.born = this.tick;
      this.bind(e);
    }
    this.sceneHistory.push({ tick: this.tick, scene: sceneId });
    this.callAll([...this.world.entities], Call.Start);
    for (const p of this.plugins) p.instance.start?.();
    this.dispatchEvents();
    // A scene's own start may spawn or switch again; settle once more.
    if (this.spawned.length > 0 || this.removing.size > 0) this.settleLifecycle();
  }

  /**
   * Advance by wall-clock seconds, running as many fixed ticks as fit.
   * Returns the interpolation factor (0..1) for rendering between ticks.
   */
  advance(seconds: number): number {
    this.accumulator += Math.max(0, seconds);
    let steps = 0;
    while (this.accumulator >= this.dt && steps < MAX_CATCH_UP_TICKS) {
      this.step();
      this.accumulator -= this.dt;
      steps += 1;
    }
    if (steps === MAX_CATCH_UP_TICKS) this.accumulator = Math.min(this.accumulator, this.dt);
    return this.accumulator / this.dt;
  }

  private dispatchEvents(): void {
    for (let round = 0; round < this.maxEventRounds && this.pending.length > 0; round++) {
      const batch = this.pending;
      this.pending = [];
      for (const event of batch) {
        if (this.events.length < MAX_LOGGED_EVENTS) this.events.push(event);
        this.eventTotals.set(event.name, (this.eventTotals.get(event.name) ?? 0) + 1);
        const source = event.source === null ? -1 : this.world.handle(event.source);
        for (const { handle: h, binding: b, slot } of this.listenersOf(event.name)) {
          if (!this.exists(h) || !this.world.activeInHierarchy(h)) continue;
          this.call(h, b, Call.Event, slot, source, event.value);
        }
        for (const listener of this.listeners.get(event.name) ?? []) listener(event);
      }
    }
  }

  /**
   * Behavior bindings that declare an event, in entity order. Cached per event
   * name and rebuilt only after entities are bound or removed, so dispatch
   * costs O(listeners) instead of O(entities).
   */
  private listenersOf(name: string): readonly { handle: number; binding: BehaviorBinding; slot: number }[] {
    let list = this.eventIndex.get(name);
    if (list === undefined) {
      list = [];
      for (const e of this.world.entities) {
        for (const binding of this.bindings.get(e.handle) ?? []) {
          const slot = binding.iface.events.indexOf(name);
          if (slot >= 0) list.push({ handle: e.handle, binding, slot });
        }
      }
      this.eventIndex.set(name, list);
    }
    return list;
  }

  /** Stop plugins. The runtime can be started again only by creating a new one. */
  stop(): void {
    for (const p of this.plugins) p.instance.stop?.();
  }

  dispose(): void {
    for (const p of this.plugins) p.instance.dispose?.();
    this.plugins.length = 0;
    this.listeners.clear();
    this.bindings.clear();
    this.eventIndex.clear();
  }

  /** A plugin's instance, for platforms that call its drawing hooks. */
  plugin(name: string): PluginInstance | undefined {
    return this.plugins.find((p) => p.name === name)?.instance;
  }

  /** Render description for the current state, interpolated by alpha (0..1). */
  frame(alpha = 1): RenderFrame {
    return buildFrame(this, alpha);
  }

  snapshot(): Snapshot {
    const entities: Snapshot["entities"] = {};
    for (const e of this.world.entities) {
      entities[e.id] = {
        active: e.active,
        transform: { ...e.transform },
        state: Object.fromEntries(e.state),
        ...(e.prefab !== undefined && { prefab: e.prefab }),
      };
    }
    return { tick: this.tick, elapsed: this.elapsed, entities };
  }

  /**
   * Read a runtime property by path: "transform.position.x", "transform.rotation",
   * "transform.scale.y", "state.<name>", "active". Returns undefined when unknown.
   */
  read(id: string, property: string): number | boolean | undefined {
    const e = this.world.byStableId(id);
    if (e === undefined) return undefined;
    const keys = parsePropertyPath(property);
    const [head, a, b] = keys;
    if (head === "active" && keys.length === 1) return e.active;
    if (head === "state" && typeof a === "string" && keys.length === 2) return e.state.get(a);
    if (head === "transform") {
      if (a === "rotation" && keys.length === 2) return e.transform.rotation;
      if (a === "position" && (b === 0 || b === 1)) return b === 0 ? e.transform.x : e.transform.y;
      if (a === "scale" && (b === 0 || b === 1)) return b === 0 ? e.transform.scaleX : e.transform.scaleY;
    }
    return undefined;
  }

  /** Number of live entities spawned from a prefab (or all spawned entities). Useful in tests. */
  countSpawned(prefab?: string): number {
    return this.world.entities.filter((e) => e.prefab !== undefined && (prefab === undefined || e.prefab === prefab)).length;
  }
}
