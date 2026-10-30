/**
 * @moonstage/rive: Rive artboards as Moonstage entities.
 *
 * The first-party reference for an advanced integration. It uses only the
 * public plugin API (level 4): Rive files are ordinary project assets, an
 * entity opts in with `extensions["@moonstage/rive"]`, the plugin draws it
 * through the drawing hooks, and state machines are driven by entity state
 * and Moonstage events. Nothing about Rive leaks into core.
 *
 *   "assets":  { "hero": { "path": "assets/hero.riv" } }
 *   "plugins": { "@moonstage/rive": { "module": "@moonstage/rive" } }
 *   entity:    "extensions": { "@moonstage/rive": {
 *                "asset": "hero", "stateMachine": "Main", "size": [200, 200],
 *                "inputs": { "speed": "speed" },        // SM input <- entity state
 *                "triggers": { "jump": "jumped" } } }    // SM trigger <- Moonstage event
 *
 * Rive events reported by a state machine are emitted as Moonstage events
 * with the entity as source. Headless (no DOM: CLI tests, `moonstage render`)
 * the plugin runs without the Rive runtime and draws placeholders, so projects
 * stay testable everywhere.
 */

import type { CustomItem, MoonstagePlugin, PluginContext, PluginLoadContext } from "@moonstage/core";
import type {
  Artboard,
  File as RiveFile,
  LinearAnimationInstance,
  RiveCanvas,
  SMIInput,
  StateMachineInstance,
  WrappedRenderer,
} from "@rive-app/canvas-advanced";

export const PLUGIN_NAME = "@moonstage/rive";

export interface RiveExtension {
  /** Asset id of a .riv file declared under `assets`. */
  asset: string;
  /** Artboard name (default: the file's default artboard). */
  artboard?: string;
  /** State machine name (default: the artboard's first state machine, if any). */
  stateMachine?: string;
  /** Linear animation to loop when the artboard has no state machine (default: its first animation). */
  animation?: string;
  /** Drawn size in local pixels. */
  size: [number, number];
  /** How the artboard fits the size (default "contain"). */
  fit?: "fill" | "contain" | "cover" | "fitWidth" | "fitHeight" | "none" | "scaleDown";
  /** State machine input name -> entity state name. Booleans are true when the state is non-zero. */
  inputs?: Record<string, string>;
  /** State machine trigger name -> Moonstage event name that fires it. */
  triggers?: Record<string, string>;
  /** Emit Rive-reported events as Moonstage events (default true). */
  events?: boolean;
  layer?: number;
  opacity?: number;
  space?: "world" | "screen";
}

interface Instance {
  ext: RiveExtension;
  artboard?: Artboard;
  machine?: StateMachineInstance;
  animation?: LinearAnimationInstance;
  inputs: Map<string, SMIInput>;
}

export interface RivePluginOptions {
  /**
   * Provide the Rive runtime. The default loads @rive-app/canvas-advanced in
   * browsers and returns undefined (headless mode) elsewhere. Tests inject a fake.
   */
  loadRuntime?: () => Promise<RiveCanvas | undefined>;
}

async function loadBrowserRuntime(): Promise<RiveCanvas | undefined> {
  if (typeof document === "undefined") return undefined;
  const specifier = "@rive-app/canvas-advanced";
  const mod = (await import(specifier)) as { default: (options: { locateFile(file: string): string }) => Promise<RiveCanvas> };
  // The runtime asks for "canvas_advanced.wasm", but the package ships its WebAssembly as rive.wasm
  // (Rive's own high-level wrapper resolves it the same way).
  const wasm = new URL("rive.wasm", import.meta.resolve(specifier)).href;
  return mod.default({ locateFile: () => wasm });
}

const isRive = (path: string, type?: string) => type === "rive" || (type === undefined && path.toLowerCase().endsWith(".riv"));

const SIZE = { type: "array", prefixItems: [{ type: "number" }, { type: "number" }], minItems: 2, maxItems: 2 };
const NAME_MAP = { type: "object", additionalProperties: { type: "string" } };

export function createRivePlugin(options: RivePluginOptions = {}): MoonstagePlugin {
  // Shared by every runtime created from this plugin object; filled by load().
  let rive: RiveCanvas | undefined;
  const files = new Map<string, RiveFile>();

  return {
    name: PLUGIN_NAME,
    version: "0.0.0",
    pluginApi: 4,
    draws: true,
    provides: ["rive"],
    capabilities: ["world.read", "events"],
    description: "Draws Rive artboards and drives their state machines from entity state and events.",
    extensionSchema: {
      type: "object",
      required: ["asset", "size"],
      additionalProperties: false,
      properties: {
        asset: { type: "string", minLength: 1 },
        artboard: { type: "string" },
        stateMachine: { type: "string" },
        animation: { type: "string" },
        size: SIZE,
        fit: { enum: ["fill", "contain", "cover", "fitWidth", "fitHeight", "none", "scaleDown"] },
        inputs: NAME_MAP,
        triggers: NAME_MAP,
        events: { type: "boolean" },
        layer: { type: "integer" },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        space: { enum: ["world", "screen"] },
      },
    },

    async load(context: PluginLoadContext) {
      rive ??= await (options.loadRuntime ?? loadBrowserRuntime)();
      if (rive === undefined) return;
      for (const [id, asset] of Object.entries(context.project.assets ?? {})) {
        if (!isRive(asset.path, asset.type) || files.has(id)) continue;
        const bytes = await context.readFile(asset.path);
        if (bytes === undefined) throw new Error(`Rive asset "${id}" (${asset.path}) not found`);
        files.set(id, await rive.load(bytes));
      }
    },

    create(ctx: PluginContext) {
      const instances = new Map<string, Instance>();
      const renderers = new WeakMap<object, WrappedRenderer>();
      const unsubscribe: (() => void)[] = [];

      const track = (id: string) => {
        const ext = ctx.world.extension(id) as RiveExtension | undefined;
        if (ext === undefined || instances.has(id)) return;
        const instance: Instance = { ext, inputs: new Map() };
        const file = files.get(ext.asset);
        if (rive !== undefined && file !== undefined) {
          const artboard = ext.artboard ? file.artboardByName(ext.artboard) : file.defaultArtboard();
          instance.artboard = artboard;
          const definition = ext.stateMachine
            ? artboard.stateMachineByName(ext.stateMachine)
            : artboard.stateMachineCount() > 0
              ? artboard.stateMachineByIndex(0)
              : undefined;
          if (definition !== undefined) {
            const machine = new rive.StateMachineInstance(definition, artboard);
            instance.machine = machine;
            for (let i = 0; i < machine.inputCount(); i++) {
              const input = machine.input(i);
              instance.inputs.set(input.name, input);
            }
          } else if (ext.animation !== undefined || artboard.animationCount() > 0) {
            const animation = ext.animation ? artboard.animationByName(ext.animation) : artboard.animationByIndex(0);
            instance.animation = new rive.LinearAnimationInstance(animation, artboard);
          }
        }
        instances.set(id, instance);
      };
      const release = (id: string) => {
        const instance = instances.get(id);
        if (instance === undefined) return;
        instance.machine?.delete();
        instance.animation?.delete();
        instance.artboard?.delete();
        instances.delete(id);
      };
      const fire = (event: string, source: string | null) => {
        for (const [id, instance] of instances) {
          if (source !== null && source !== id) continue;
          for (const [trigger, name] of Object.entries(instance.ext.triggers ?? {})) {
            if (name === event) instance.inputs.get(trigger)?.asTrigger().fire();
          }
        }
      };

      return {
        start() {
          for (const id of ctx.world.withExtension()) track(id);
          const events = new Set(
            [...instances.values()].flatMap((i) => Object.values(i.ext.triggers ?? {})),
          );
          for (const event of events) unsubscribe.push(ctx.events.on(event, (e) => fire(e.name, e.source)));
        },
        entityAdded: (id) => track(id),
        entityRemoved: (id) => release(id),
        update(dt) {
          for (const [id, instance] of instances) {
            if (!ctx.world.active(id)) continue;
            for (const [inputName, stateName] of Object.entries(instance.ext.inputs ?? {})) {
              const input = instance.inputs.get(inputName);
              if (input === undefined) continue;
              const value = ctx.world.state(id, stateName);
              if (typeof input.value === "boolean") input.value = value !== 0;
              else if (typeof input.value === "number") input.value = value;
            }
            if (instance.machine !== undefined) {
              instance.machine.advance(dt);
              if (instance.ext.events !== false) {
                for (let i = 0; i < instance.machine.reportedEventCount(); i++) {
                  const reported = instance.machine.reportedEventAt(i);
                  if (reported?.name) ctx.events.emit(reported.name, 1, id);
                }
              }
            }
            if (instance.animation !== undefined) {
              instance.animation.advance(dt);
              instance.animation.apply(1);
            }
            instance.artboard?.advance(dt);
          }
        },
        stop() {
          for (const off of unsubscribe.splice(0)) off();
          for (const id of [...instances.keys()]) release(id);
        },
        drawCanvas2d(context: unknown, item: CustomItem) {
          const instance = instances.get(item.entity);
          const [w, h] = instance?.ext.size ?? item.size ?? [32, 32];
          const c = context as CanvasRenderingContext2D;
          if (rive === undefined || instance?.artboard === undefined) {
            c.strokeStyle = "#ff00ff";
            c.setLineDash([4, 3]);
            c.strokeRect(-w / 2, -h / 2, w, h);
            return;
          }
          // makeRenderer takes the canvas but draws through its (shared) 2D context, so the artboard
          // lands in the entity's local space that the player already set on that context.
          const renderer: WrappedRenderer = renderers.get(c.canvas) ?? rive.makeRenderer(c.canvas as HTMLCanvasElement);
          renderers.set(c.canvas, renderer);
          const fit = rive.Fit[instance.ext.fit ?? "contain"];
          // Rive's Canvas 2D renderer queues draws: beginFrame(false) registers it without clearing the
          // canvas, and resolveAnimationFrame() replays the queue now, while the entity's transform is
          // still on the context. (flush() alone draws nothing.)
          renderer.beginFrame(false);
          renderer.save();
          renderer.align(fit, rive.Alignment.center, { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2 }, instance.artboard.bounds);
          instance.artboard.draw(renderer);
          renderer.restore();
          rive.resolveAnimationFrame();
        },
        drawSvg(item: CustomItem) {
          const instance = instances.get(item.entity);
          const [w, h] = instance?.ext.size ?? item.size ?? [32, 32];
          const label = instance?.ext.artboard ?? instance?.ext.asset ?? "rive";
          return (
            `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="none" stroke="#a78bfa" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>` +
            `<text y="4" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#a78bfa">${label.replace(/[<&"]/g, "")}</text>`
          );
        },
      };
    },
  };
}

export default createRivePlugin();
