// Builds @moonstage/physics after `tsc -b`: compiles the MoonBit engine to
// WebAssembly and embeds it (base64) into plugins/physics/dist/index.js, so the
// plugin ships as one self-contained module.
//
// Needs the MoonBit toolchain. Without it, an existing build is kept (CI and
// contributors with `moon` always rebuild); if there is none, the plugin is
// left unbuilt and the step reports it instead of failing the whole build.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(repo, "plugins", "physics");
const moduleDir = join(plugin, "moonbit");
const dist = join(plugin, "dist", "index.js");
const wasm = join(moduleDir, "_build", "wasm", "release", "build", "engine", "engine.wasm");
const PLACEHOLDER = "__MOONSTAGE_PHYSICS_ENGINE__";

function findMoon() {
  if (process.env.MOONSTAGE_MOON) return process.env.MOONSTAGE_MOON;
  for (const dir of (process.env.PATH ?? "").split(":")) if (dir && existsSync(join(dir, "moon"))) return join(dir, "moon");
  const home = join(homedir(), ".moon", "bin", "moon");
  return existsSync(home) ? home : undefined;
}

const source = readFileSync(dist, "utf8");
if (!source.includes(PLACEHOLDER)) {
  // tsc did not re-emit (nothing changed) and the engine is already embedded.
  process.exit(0);
}
const moon = findMoon();
if (moon) {
  execFileSync(moon, ["build", "--target", "wasm", "--release", "--quiet"], { cwd: moduleDir, stdio: "inherit" });
} else if (!existsSync(wasm)) {
  console.warn("@moonstage/physics: MoonBit (`moon`) not found; the physics engine was not built.");
  process.exit(0);
}
writeFileSync(dist, source.replace(PLACEHOLDER, readFileSync(wasm).toString("base64")));
