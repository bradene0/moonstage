/**
 * Compiles MoonBit behaviors to WebAssembly with the `moon` toolchain.
 *
 * The project's behaviors directory is an ordinary MoonBit module. The CLI
 * generates a moon.work in .moonstage/moon/ that combines it with the
 * Moonstage MoonBit SDK, runs `moon build --target wasm`, and copies each
 * behavior's artifact to .moonstage/behaviors/<name>.wasm.
 */

import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_DIR, compiledBehaviorPath, diagnostic, type Diagnostic, type ProjectManifest } from "@moonstage/core";

/** Locate the `moon` binary: $MOONSTAGE_MOON, then PATH, then ~/.moon/bin. */
export function findMoon(): string | undefined {
  const fromEnv = process.env.MOONSTAGE_MOON;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : undefined;
  const exe = process.platform === "win32" ? "moon.exe" : "moon";
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir && existsSync(join(dir, exe))) return join(dir, exe);
  }
  const home = join(homedir(), ".moon", "bin", exe);
  return existsSync(home) ? home : undefined;
}

/** Locate the MoonBit SDK: $MOONSTAGE_MOONBIT_SDK, the copy shipped in the CLI package, or the monorepo. */
export function findMoonbitSdk(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MOONSTAGE_MOONBIT_SDK,
    resolve(here, "..", "moonbit-sdk"),
    resolve(here, "..", "..", "moonbit-sdk"),
  ];
  return candidates.find((c): c is string => c !== undefined && existsSync(join(c, "moon.mod")));
}

/** Nearest directory at or above `start` (but not above `root`) containing moon.mod. */
function moduleRoot(start: string, root: string): string | undefined {
  for (let dir = start; dir.startsWith(root); dir = dirname(dir)) {
    if (existsSync(join(dir, "moon.mod"))) return dir;
    if (dir === dirname(dir)) break;
  }
  return undefined;
}

async function moduleName(dir: string): Promise<string | undefined> {
  const text = await readFile(join(dir, "moon.mod"), "utf8");
  return /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1];
}

const SLOT_PREFIX = /\b(param|state|ref|input|event|prefab|scene|sound)_[a-z0-9_]+\b/;

/** Advice for the MoonBit mistakes agents and newcomers make most (see docs/moonbit.md). */
export function compilerHint(code: number, message: string): string | undefined {
  switch (code) {
    case 4059:
      return "A parameter named `self` declares a method. Name the first parameter `entity`.";
    case 4021: {
      const slot = SLOT_PREFIX.exec(message)?.[0];
      if (slot !== undefined) {
        return `\`${slot}\` is not a generated slot. Declare the name in this behavior's lists in moonstage.json (e.g. "params": [...]); \`moonstage build\` regenerates slots.generated.mbt.`;
      }
      if (/\bMath\b/.test(message)) return "Use `@math.sin` etc., and import \"moonbitlang/core/math\" in moon.pkg.";
      return "Unknown name. Check spelling, the package's imports in moon.pkg, and `moonstage guide moonbit`.";
    }
    case 4014:
      if (/wanted\s*:\s*Unit/.test(message)) return "The result of a call is unused: append `|> ignore`.";
      if (/Int/.test(message) && /Double/.test(message)) return "MoonBit never converts numbers implicitly: use `.to_double()` or `.to_int()`.";
      return "Type mismatch. See `moonstage guide moonbit`.";
    case 4087:
      return "Assigning to an immutable variable: declare it with `let mut`.";
    default:
      return undefined;
  }
}

function realpathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    child.on("error", (err) => done({ code: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", (code) => done({ code: code ?? -1, stdout, stderr }));
  });
}

export interface BehaviorBuild {
  name: string;
  source: string;
  output: string;
  bytes: number;
}

export interface MoonbitBuildResult {
  behaviors: BehaviorBuild[];
  diagnostics: Diagnostic[];
  /** True when a toolchain problem (not a code problem) stopped the build. */
  environmentError: boolean;
}

export async function buildMoonbitBehaviors(root: string, manifest: ProjectManifest): Promise<MoonbitBuildResult> {
  const sources = Object.entries(manifest.behaviors ?? {}).filter(
    (entry): entry is [string, typeof entry[1] & { source: string }] => entry[1].source !== undefined,
  );
  const out: MoonbitBuildResult = { behaviors: [], diagnostics: [], environmentError: false };
  if (sources.length === 0) return out;

  const moon = findMoon();
  if (moon === undefined) {
    out.environmentError = true;
    out.diagnostics.push(diagnostic("MS3005", "the MoonBit `moon` command was not found"));
    return out;
  }
  const sdk = findMoonbitSdk();
  if (sdk === undefined) {
    out.environmentError = true;
    out.diagnostics.push(
      diagnostic("MS3005", "the Moonstage MoonBit SDK was not found", { hint: "Set MOONSTAGE_MOONBIT_SDK to its directory." }),
    );
    return out;
  }

  // Map each behavior to its MoonBit module and package.
  const modules = new Map<string, string>();
  const targets: { name: string; source: string; pkg: string }[] = [];
  for (const [name, decl] of sources) {
    const dir = resolve(root, decl.source);
    const modRoot = existsSync(dir) ? moduleRoot(dir, root) : undefined;
    if (modRoot === undefined) {
      out.diagnostics.push(
        diagnostic("MS1003", `behavior "${name}": ${decl.source} is not inside a MoonBit module (no moon.mod found)`, {
          file: "moonstage.json",
          path: `behaviors.${name}.source`,
        }),
      );
      continue;
    }
    const modName = modules.get(modRoot) ?? (await moduleName(modRoot));
    if (modName === undefined) {
      out.diagnostics.push(diagnostic("MS3006", `${relative(root, modRoot)}/moon.mod has no name`));
      continue;
    }
    modules.set(modRoot, modName);
    const rel = relative(modRoot, dir).split(sep).join("/");
    targets.push({ name, source: decl.source, pkg: rel === "" ? modName : `${modName}/${rel}` });
  }
  if (out.diagnostics.length > 0) return out;

  const workDir = join(root, BUILD_DIR, "moon");
  await mkdir(workDir, { recursive: true });
  const members = [sdk, ...modules.keys()].map((m) => `  ${JSON.stringify(m)},`).join("\n");
  await writeFile(join(workDir, "moon.work"), `// Generated by moonstage build. Do not edit.\nmembers = [\n${members}\n]\n`);

  const { code, stdout, stderr } = await run(
    moon,
    ["build", "--target", "wasm", "--release", "--output-json", "--target-dir", join(workDir, "_build")],
    workDir,
  );

  // moon reports canonical paths (e.g. /private/var on macOS); compare like with like.
  const realRoot = realpathSync(root);
  const artifacts = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (msg.$message_type === "artifact" && typeof msg.package === "string" && typeof msg.path === "string") {
      artifacts.set(msg.package, msg.path);
    } else if (msg.$message_type === "diagnostic" && msg.level === "error") {
      const file = typeof msg.path === "string" ? relative(realRoot, realpathOr(msg.path)).split(sep).join("/") : undefined;
      const advice = compilerHint(Number(msg.error_code), String(msg.message));
      const context = typeof msg.context === "string" ? msg.context.trimEnd() : undefined;
      out.diagnostics.push(
        diagnostic("MS3006", `MoonBit error ${String(msg.error_code ?? "")}: ${String(msg.message)}`, {
          ...(file !== undefined && { file }),
          ...(typeof msg.loc === "string" && { path: msg.loc }),
          hint: [advice, context].filter(Boolean).join("\n") || undefined,
        }),
      );
    }
  }
  if (code !== 0) {
    if (out.diagnostics.length === 0) {
      out.diagnostics.push(diagnostic("MS3006", `moon build failed (exit ${code}): ${stderr.trim() || stdout.trim()}`));
    }
    return out;
  }

  await mkdir(join(root, BUILD_DIR, "behaviors"), { recursive: true });
  for (const t of targets) {
    const artifact = artifacts.get(t.pkg);
    if (artifact === undefined) {
      out.diagnostics.push(
        diagnostic("MS3006", `behavior "${t.name}": moon produced no wasm for package ${t.pkg}`, {
          hint: "Make sure the package's moon.pkg has options(link: { \"wasm\": { \"exports\": [...] } }).",
        }),
      );
      continue;
    }
    const output = compiledBehaviorPath(t.name);
    await copyFile(artifact, join(root, output));
    const bytes = (await readFile(artifact)).byteLength;
    out.behaviors.push({ name: t.name, source: t.source, output, bytes });
  }
  return out;
}
