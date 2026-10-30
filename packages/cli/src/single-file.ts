/**
 * Single-file web export: one .html that plays the game with no server, no
 * network and no other files. Useful for sharing, attaching to messages and
 * running inside chat or sandboxed preview widgets.
 *
 * The page carries the runtime's ES modules (core + player) as gzipped JSON
 * and the game as an .msp package, both base64. A small inline loader turns the modules
 * into blob: URLs in dependency order, rewriting their relative imports, and
 * hands the package bytes to `play()`.
 */

import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

function packageDist(specifier: string): string {
  return dirname(fileURLToPath(import.meta.resolve(specifier)));
}

async function moduleSources(prefix: string, dir: string, out: Record<string, string>): Promise<void> {
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js") || entry.name.endsWith(".test.js")) continue;
    const path = join(entry.parentPath, entry.name);
    out[`${prefix}/${relative(dir, path).split(sep).join("/")}`] = await readFile(path, "utf8");
  }
}

/** Runs in the page: blob-URL module loader, then play the inlined package. */
const LOADER = `
const decode = (id) => Uint8Array.from(atob(document.getElementById(id).textContent.trim()), (c) => c.charCodeAt(0));
const gunzip = (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
const sources = JSON.parse(await gunzip(decode("moonstage-modules")));
const urls = {};
const SPECIFIER = /((?:import|export)\\s[^"';]*?from\\s*)(["'])([^"']+)\\2/g;
function resolve(from, spec) {
  if (spec === "@moonstage/core") return "core/index.js";
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}
function load(key, stack = new Set()) {
  if (urls[key]) return urls[key];
  if (!(key in sources)) throw new Error("moonstage: missing module " + key);
  if (stack.has(key)) throw new Error("moonstage: module cycle at " + key);
  stack.add(key);
  const code = sources[key].replace(SPECIFIER, (match, head, quote, spec) => {
    const target = resolve(key, spec);
    return target === null ? match : head + quote + load(target, stack) + quote;
  });
  stack.delete(key);
  return (urls[key] = URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
}
const bytes = decode("moonstage-game");
const { play } = await import(load("player/index.js"));
await play("#game", bytes, { autofocus: true });
`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function singleFileHtml(name: string, display: { width?: number; height?: number }, msp: Uint8Array): Promise<string> {
  const sources: Record<string, string> = {};
  await moduleSources("core", packageDist("@moonstage/core"), sources);
  await moduleSources("player", packageDist("@moonstage/player"), sources);
  const { width = 800, height = 600 } = display;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #05070d; display: grid; place-items: center; }
  #game { width: min(100vw, ${width}px); aspect-ratio: ${width} / ${height}; }
</style>
</head>
<body>
<div id="game"></div>
<script type="application/octet-stream" id="moonstage-modules">${gzipSync(JSON.stringify(sources), { level: 9 }).toString("base64")}</script>
<script type="application/octet-stream" id="moonstage-game">${Buffer.from(msp).toString("base64")}</script>
<script type="module">${LOADER}</script>
</body>
</html>
`;
}
