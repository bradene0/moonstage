/**
 * Web bundle: a static directory that plays the project in any modern
 * browser. No bundler is involved; the runtime ships as plain ES modules and
 * an import map resolves "@moonstage/core".
 *
 *   dist/
 *     index.html            page with <moonstage-player>
 *     runtime/core/...      @moonstage/core
 *     runtime/player/...    @moonstage/player
 *     game/                 project files (manifest, scenes, behaviors, plugins)
 */

import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { behaviorWasmPath, type ProjectManifest } from "@moonstage/core";

function packageDist(specifier: string): string {
  return dirname(fileURLToPath(import.meta.resolve(specifier)));
}

const html = (title: string, width: number, height: number, imports: Record<string, string>) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<script type="importmap">
${JSON.stringify({ imports }, null, 2)}
</script>
<style>
  html, body { margin: 0; height: 100%; background: #05070d; display: grid; place-items: center; }
  moonstage-player { width: min(100vw, ${width}px); aspect-ratio: ${width} / ${height}; }
</style>
</head>
<body>
<moonstage-player src="./game/" autofocus></moonstage-player>
<script type="module" src="./runtime/player/element.js"></script>
</body>
</html>
`;

/** Project-relative files a project needs at runtime (no sources, no tests). */
export function runtimeFiles(manifest: ProjectManifest): string[] {
  const files = ["moonstage.json", ...Object.values(manifest.scenes)];
  for (const [name, decl] of Object.entries(manifest.behaviors ?? {})) files.push(behaviorWasmPath(name, decl));
  for (const { module } of Object.values(manifest.plugins ?? {})) {
    if (module.startsWith("./")) files.push(module.slice(2));
  }
  for (const { path } of Object.values(manifest.assets ?? {})) files.push(path);
  return [...new Set(files)];
}

/** Copy compiled JS only (no tests, maps, TypeScript sources or build info). */
const runtimeFilter = (src: string) => !/\.test\.js$|\.map$|\.ts$|\.tsbuildinfo$|tsconfig\.json$/.test(src);

export async function writeBundle(root: string, manifest: ProjectManifest, outDir: string): Promise<{ files: string[] }> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(packageDist("@moonstage/core"), join(outDir, "runtime", "core"), { recursive: true, filter: runtimeFilter });
  await cp(packageDist("@moonstage/player"), join(outDir, "runtime", "player"), { recursive: true, filter: runtimeFilter });

  const files = runtimeFiles(manifest);
  for (const file of files) {
    const from = join(root, file);
    if (!existsSync(from)) continue;
    const to = join(outDir, "game", file);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
  const imports: Record<string, string> = { "@moonstage/core": "./runtime/core/index.js" };
  const packages = await copyPluginPackages(root, manifest, join(outDir, "runtime", "modules"), imports);
  const { width = 800, height = 600 } = manifest.display ?? {};
  await writeFile(join(outDir, "index.html"), html(manifest.name, width, height, imports));
  return { files: [...files, ...packages] };
}

/** Directory of the package that contains `file` (nearest package.json). */
function packageRoot(file: string): string {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
  }
  throw new Error(`no package.json above ${file}`);
}

/** The ES module entry of a package: exports["."] (import/default), then module, then main. */
export function packageEntry(dir: string): string {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    exports?: unknown;
    module?: string;
    main?: string;
  };
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (value === null || typeof value !== "object") return undefined;
    const v = value as Record<string, unknown>;
    return pick(v["."]) ?? pick(v.import) ?? pick(v.browser) ?? pick(v.default);
  };
  return pick(pkg.exports) ?? pkg.module ?? pkg.main ?? "index.js";
}

/**
 * Copy plugins given as package specifiers (e.g. "@moonstage/rive"), and their
 * dependencies, into the bundle and map them in the import map. Packages
 * resolve from the project directory, like Node would.
 */
async function copyPluginPackages(
  root: string,
  manifest: ProjectManifest,
  outDir: string,
  imports: Record<string, string>,
): Promise<string[]> {
  const copied: string[] = [];
  const queue: { name: string; from: string }[] = Object.values(manifest.plugins ?? {})
    .map((p) => p.module)
    .filter((m) => !m.startsWith(".") && !m.startsWith("/"))
    .map((name) => ({ name, from: join(root, "package.json") }));
  while (queue.length > 0) {
    const { name, from } = queue.shift()!;
    if (name in imports || name === "@moonstage/player") continue;
    let dir: string;
    try {
      dir = packageRoot(createRequire(from).resolve(`${name}/package.json`));
    } catch {
      dir = packageRoot(createRequire(from).resolve(name));
    }
    const target = join(outDir, name);
    await cp(dir, target, { recursive: true, filter: (src) => !/[\\/]node_modules([\\/]|$)/.test(src.slice(dir.length)) && runtimeFilter(src) });
    imports[name] = `./runtime/modules/${name}/${packageEntry(dir).replace(/^\.\//, "")}`;
    copied.push(`runtime/modules/${name}`);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const dep of Object.keys({ ...pkg.peerDependencies, ...pkg.dependencies })) {
      queue.push({ name: dep, from: join(dir, "package.json") });
    }
  }
  return copied;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".css": "text/css; charset=utf-8",
};

/** Minimal static file server for local play. Binds to localhost only. */
export function serve(dir: string, port: number): Promise<{ server: Server; url: string }> {
  const base = resolve(dir);
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    let file = normalize(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      await stat(file);
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      done({ server, url: `http://localhost:${actual}/` });
    });
  });
}
