/** Filesystem-backed project access for the CLI. */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  diagnostic,
  loadProject,
  readJson,
  validateTestShape,
  type Diagnostic,
  type LoadOptions,
  type LoadResult,
  type ProjectIO,
  type TestSource,
} from "@moonstage/core";

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
      // Relative specifiers are project files; anything else resolves like a package.
      const target = specifier.startsWith(".") || specifier.startsWith("/") ? pathToFileURL(abs(specifier)).href : specifier;
      return import(target);
    },
  };
}

/** Resolve the project root argument; error diagnostics when it is not a project. */
export function projectRoot(dir: string | undefined): { root: string; diagnostics: Diagnostic[] } {
  const root = resolve(dir ?? ".");
  if (!existsSync(join(root, "moonstage.json"))) {
    return {
      root,
      diagnostics: [diagnostic("MS9002", `${root} has no moonstage.json`)],
    };
  }
  return { root, diagnostics: [] };
}

export async function load(root: string, options?: LoadOptions): Promise<LoadResult> {
  return loadProject(fileIO(root), options);
}

export interface LoadedTest {
  file: string;
  test?: TestSource;
  diagnostics: Diagnostic[];
}

/** Read and validate every tests/*.test.json file. */
export async function loadTests(root: string): Promise<LoadedTest[]> {
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
