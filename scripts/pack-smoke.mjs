// Packs every workspace package, installs the tarballs into a fresh directory
// outside the monorepo, and drives the installed CLI the way a new user or
// agent would: new -> validate -> test -> build. Run after `npm run build`.
// Requires the MoonBit toolchain. Never publishes anything.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(repo, ".release");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

rmSync(release, { recursive: true, force: true });
mkdirSync(release);
run(npm, ["pack", "--workspaces", "--pack-destination", release, "--silent"], repo);
const tarballs = readdirSync(release).filter((f) => f.endsWith(".tgz")).map((f) => join(release, f));
console.log(`packed: ${tarballs.map((t) => t.slice(release.length + 1)).join(", ")}`);
if (existsSync(join(repo, "packages", "cli", "moonbit-sdk"))) throw new Error("postpack did not remove packages/cli/moonbit-sdk");

const dir = mkdtempSync(join(tmpdir(), "moonstage-pack-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run(npm, ["install", "--no-audit", "--no-fund", "--silent", ...tarballs], dir);
  const bin = join(dir, "node_modules", ".bin", process.platform === "win32" ? "moonstage.cmd" : "moonstage");
  const cli = (...args) => {
    const out = JSON.parse(run(bin, [...args, "--json"], dir));
    if (!out.ok) throw new Error(`moonstage ${args.join(" ")} failed:\n${JSON.stringify(out.diagnostics, null, 2)}`);
    return out;
  };

  const described = cli("describe");
  if (!described.toolchain.moon) throw new Error("MoonBit toolchain not found");
  cli("new", "game", "--name", "Packed Game");
  cli("validate", "game");
  const tested = cli("test", "game");
  if (tested.passed < 1 || tested.failed !== 0) throw new Error("template tests did not pass");
  const built = cli("build", "game");
  if (!existsSync(join(built.bundle, "index.html")) || !existsSync(join(built.bundle, "runtime", "core", "index.js"))) {
    throw new Error("web bundle is incomplete");
  }
  cli("plugin", "new", "plugin", "--name", "Smoke Plugin");
  const checked = cli("plugin", "check", "plugin");
  if (!checked.passed) throw new Error("template plugin failed the conformance suite");
  // The plugin template's own test imports @moonstage/core; run it against the packed core.
  run(npm, ["install", "--no-audit", "--no-fund", "--silent", ...tarballs], join(dir, "plugin"));
  run(npm, ["test", "--silent"], join(dir, "plugin"));
  console.log(`ok: installed CLI created, tested and built a project (${tested.passed} test passed) and a conforming plugin`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
