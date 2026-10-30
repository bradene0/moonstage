/** Filesystem-backed project access for the CLI. */

import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  diagnostic,
  loadProject,
  MoonstageError,
  mspIO,
  readJson,
  validateTestShape,
  type Diagnostic,
  type LoadOptions,
  type LoadResult,
  type ProjectIO,
  type TestSource,
} from "@moonstage/core";

/**
 * File path of a package plugin's entry module. Resolves from the project
 * directory first (like Node), then from the CLI itself, so first-party
 * plugins the CLI ships with (e.g. @moonstage/physics) work without a local
 * install. Returns undefined when neither can resolve it.
 */
export function resolvePlugin(root: string, specifier: string): string | undefined {
  for (const from of [join(root, "package.json"), fileURLToPath(import.meta.url)]) {
    try {
      return createRequire(from).resolve(specifier);
    } catch {
      // try the next location
    }
  }
  return undefined;
}

export function fileIO(root: string): ProjectIO {
  const abs = (path: string) => (isAbsolute(path) ? path : join(root, path));
  return {
    async readText(path) {
      try {
        return await readFile(abs(path), "utf8");
      } catch {
        return undefined;
      }
    },
    async readBytes(path) {
      try {
        return new Uint8Array(await readFile(abs(path)));
      } catch {
        return undefined;
      }
    },
    async importModule(specifier) {
      // Relative specifiers are project files; packages resolve from the project directory, like Node would.
      if (specifier.startsWith(".") || specifier.startsWith("/")) return import(pathToFileURL(abs(specifier)).href);
      const resolved = resolvePlugin(root, specifier);
      return import(resolved !== undefined ? pathToFileURL(resolved).href : specifier);
    },
  };
}

/** Resolve the project root argument; error diagnostics when it is not a project. */
/** True for a path to an .msp package file (as opposed to a project directory). */
export function isPackage(path: string): boolean {
  return path.endsWith(".msp") && existsSync(path) && statSync(path).isFile();
}

/** ProjectIO for a project directory or an .msp package. */
export async function ioFor(root: string): Promise<ProjectIO> {
  return isPackage(root) ? mspIO(new Uint8Array(await readFile(root))) : fileIO(root);
}

export function projectRoot(dir: string | undefined): { root: string; diagnostics: Diagnostic[] } {
  const root = resolve(dir ?? ".");
  if (isPackage(root)) return { root, diagnostics: [] };
  if (!existsSync(join(root, "moonstage.json"))) {
    return {
      root,
      diagnostics: [diagnostic("MS9002", `${root} has no moonstage.json`)],
    };
  }
  return { root, diagnostics: [] };
}

export async function load(root: string, options?: LoadOptions): Promise<LoadResult> {
  try {
    return await loadProject(await ioFor(root), options);
  } catch (err) {
    if (err instanceof MoonstageError) return { scenes: {}, diagnostics: err.diagnostics };
    throw err;
  }
}

export interface LoadedTest {
  file: string;
  test?: TestSource;
  diagnostics: Diagnostic[];
}

/** Read and validate every tests/*.test.json file. */
export async function loadTests(root: string): Promise<LoadedTest[]> {
  if (isPackage(root)) return []; // packages carry runtime files only
  let names: string[];
  try {
    names = (await readdir(join(root, "tests"))).filter((n) => n.endsWith(".test.json")).sort();
  } catch {
    return [];
  }
  const io = fileIO(root);
  return Promise.all(
    names.map(async (name) => {
      const file = `tests/${name}`;
      const read = await readJson(io, file);
      if (read.value === undefined) return { file, diagnostics: read.diagnostics };
      const diagnostics = validateTestShape(read.value, file);
      return diagnostics.length > 0 ? { file, diagnostics } : { file, test: read.value as TestSource, diagnostics };
    }),
  );
}
