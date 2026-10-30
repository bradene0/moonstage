/**
 * Project loading, independent of where files live. The CLI supplies a
 * filesystem-backed ProjectIO; the browser player supplies a fetch-backed one.
 * Both therefore load, validate and resolve projects identically.
 */

import type { BehaviorBinary } from "./behavior.js";
import { diagnostic, hasErrors, type Diagnostic } from "./diagnostics.js";
import { checkPlugin, type MoonstagePlugin } from "./plugin.js";
import {
  PHYSICS_COMPONENTS,
  validateManifestShape,
  validateProjectSemantics,
  validateSceneShape,
  type ProjectManifest,
  type SceneSource,
} from "./project.js";
import type { LoadedProject } from "./runtime.js";

export interface ProjectIO {
  /** Read a UTF-8 file relative to the project root. Resolve undefined when missing. */
  readText(path: string): Promise<string | undefined>;
  /** Read a binary file relative to the project root. Resolve undefined when missing. */
  readBytes(path: string): Promise<BehaviorBinary | undefined>;
  /** Import a plugin module. `specifier` is "./relative/path.js" or a package name. */
  importModule?(specifier: string): Promise<unknown>;
}

export interface LoadOptions {
  /** "require": missing compiled behaviors are errors (running). "optional": warnings (validating). */
  behaviors?: "require" | "optional" | "skip";
  plugins?: "load" | "skip";
}

export interface LoadResult {
  /** Present when there were no errors. */
  project?: LoadedProject;
  manifest?: ProjectManifest;
  scenes: Record<string, SceneSource>;
  diagnostics: Diagnostic[];
}

/** Where `moonstage build` writes compiled MoonBit behaviors, relative to the project root. */
export const BUILD_DIR = ".moonstage";

export function compiledBehaviorPath(name: string): string {
  return `${BUILD_DIR}/behaviors/${name}.wasm`;
}

/** Project-relative path of a behavior's WebAssembly module. */
export function behaviorWasmPath(name: string, decl: { wasm?: string }): string {
  return decl.wasm ?? compiledBehaviorPath(name);
}

export async function readJson(
  io: ProjectIO,
  path: string,
): Promise<{ value?: unknown; diagnostics: Diagnostic[] }> {
  const text = await io.readText(path);
  if (text === undefined) return { diagnostics: [diagnostic("MS1003", `${path} not found`, { file: path })] };
  try {
    return { value: JSON.parse(text), diagnostics: [] };
  } catch (err) {
    return { diagnostics: [diagnostic("MS1002", `${path}: ${(err as Error).message}`, { file: path })] };
  }
}

function pluginExport(mod: unknown): unknown {
  const m = mod as { default?: unknown; plugin?: unknown } | null;
  return m?.default ?? m?.plugin ?? mod;
}

export async function loadProject(io: ProjectIO, options: LoadOptions = {}): Promise<LoadResult> {
  const behaviorsMode = options.behaviors ?? "require";
  const pluginsMode = options.plugins ?? "load";
  const diagnostics: Diagnostic[] = [];
  const scenes: Record<string, SceneSource> = {};

  const read = await readJson(io, "moonstage.json");
  diagnostics.push(...read.diagnostics);
  if (read.value === undefined) return { scenes, diagnostics };
  const shape = validateManifestShape(read.value);
  diagnostics.push(...shape);
  if (hasErrors(shape)) return { scenes, diagnostics };
  const manifest = read.value as ProjectManifest;

  for (const [id, file] of Object.entries(manifest.scenes)) {
    const scene = await readJson(io, file);
    diagnostics.push(...scene.diagnostics);
    if (scene.value === undefined) continue;
    const sceneShape = validateSceneShape(scene.value, file);
    diagnostics.push(...sceneShape);
    if (!hasErrors(sceneShape)) scenes[id] = scene.value as SceneSource;
  }
  if (hasErrors(diagnostics)) return { manifest, scenes, diagnostics };
  diagnostics.push(...validateProjectSemantics(manifest, scenes));

  const behaviors: LoadedProject["behaviors"] = {};
  if (behaviorsMode !== "skip") {
    for (const [name, decl] of Object.entries(manifest.behaviors ?? {})) {
      const path = behaviorWasmPath(name, decl);
      const bytes = await io.readBytes(path);
      if (bytes === undefined) {
        const built = decl.wasm === undefined;
        diagnostics.push(
          diagnostic(built ? "MS3001" : "MS1003", built ? `behavior "${name}" has not been built (${path} missing)` : `${path} not found`, {
            file: path,
            severity: behaviorsMode === "require" ? "error" : "warning",
            ...(built ? {} : { hint: "Fix the behavior's `wasm` path." }),
          }),
        );
      } else {
        behaviors[name] = bytes;
      }
    }
  }

  const plugins: Record<string, MoonstagePlugin> = {};
  if (pluginsMode === "load") {
    for (const [name, decl] of Object.entries(manifest.plugins ?? {})) {
      if (io.importModule === undefined) {
        diagnostics.push(diagnostic("MS4001", `cannot load plugin "${name}": this loader does not support modules`));
        continue;
      }
      try {
        const plugin = pluginExport(await io.importModule(decl.module));
        const checks = checkPlugin(plugin, name);
        diagnostics.push(...checks);
        if (!hasErrors(checks)) plugins[name] = plugin as MoonstagePlugin;
      } catch (err) {
        diagnostics.push(
          diagnostic("MS4001", `plugin "${name}" (${decl.module}) failed to load: ${(err as Error).message}`, {
            path: `plugins.${name}.module`,
            file: "moonstage.json",
          }),
        );
      }
    }
  }

  if (pluginsMode === "load") {
    const usesPhysics = [...Object.values(scenes).flatMap((s) => s.entities), ...Object.values(manifest.prefabs ?? {})].some((e) =>
      PHYSICS_COMPONENTS.some((c) => e.components?.[c] !== undefined),
    );
    if (usesPhysics && !Object.values(plugins).some((p) => p.provides?.includes("physics"))) {
      diagnostics.push(
        diagnostic("MS2016", "the project uses physics components but no plugin provides \"physics\"", {
          severity: "warning",
          file: "moonstage.json",
          path: "plugins",
          hint: "Add a physics provider plugin; without one, physicsBody/collider/joint have no effect.",
        }),
      );
    }
  }

  if (hasErrors(diagnostics)) return { manifest, scenes, diagnostics };
  const readFile = async (path: string) => {
    const bytes = await io.readBytes(path);
    return bytes === undefined ? undefined : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  };
  return { project: { manifest, scenes, behaviors, plugins, readFile }, manifest, scenes, diagnostics };
}
