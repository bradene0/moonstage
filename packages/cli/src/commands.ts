/**
 * Command implementations. Each command takes parsed options and returns a
 * CommandResult; it never prints or exits on its own, so commands are easy to
 * test and to wrap (e.g. by a future MCP server).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BEHAVIOR_ABI,
  CAPABILITIES,
  checkPluginConformance,
  DIAGNOSTIC_CODES,
  HOST_FUNCTIONS,
  PLUGIN_API,
  PROJECT_FORMAT,
  REQUIRED_EXPORTS,
  Runtime,
  SCHEMAS,
  TRANSFORM_FIELDS,
  behaviorWasmPath,
  behaviorsOf,
  diagnostic,
  isImageAsset,
  hasErrors,
  MoonstageError,
  applyOperations,
  operationSchema,
  validateProjectSemantics,
  validateSceneShape,
  validateSchema,
  type Operation,
  type SceneSource,
  runTest,
  sceneSchema,
  type ConformanceFixture,
  type Diagnostic,
  type LoadedProject,
  type TestResult,
} from "@moonstage/core";
import { serve, writeBundle } from "./bundle.js";
import { buildMoonbitBehaviors, findMoon } from "./moonbit.js";
import { EXIT, result, type CommandResult } from "./output.js";
import { load, loadTests, projectRoot } from "./project-io.js";
import { slotCollisions, staleSlotFiles, writeSlotFiles } from "./slots.js";
import { renderSvg, svgImage, type SvgImage } from "./svg.js";

const here = dirname(fileURLToPath(import.meta.url));

export const CLI_VERSION: string = (
  JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string }
).version;

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
}

export const COMMANDS: CommandSpec[] = [
  { name: "describe", summary: "Print Moonstage capabilities, versions, components and error codes.", usage: "moonstage describe [--json]" },
  { name: "new", summary: "Create a new project from a template.", usage: "moonstage new <dir> [--name <name>] [--json]" },
  { name: "validate", summary: "Validate project files, references, plugins and tests.", usage: "moonstage validate [dir] [--json]" },
  { name: "inspect", summary: "Summarize scenes, entities, behaviors and plugins.", usage: "moonstage inspect [dir] [--json]" },
  { name: "build", summary: "Compile MoonBit behaviors and write a static web bundle.", usage: "moonstage build [dir] [--out <dir>] [--no-bundle] [--json]" },
  {
    name: "run",
    summary: "Play in the browser (local server) or simulate headlessly.",
    usage: "moonstage run [dir] [--headless --ticks <n> --seed <n> --scene <id> --input <json>] [--port <n>] [--no-build] [--json]",
  },
  { name: "test", summary: "Run tests/*.test.json headlessly.", usage: "moonstage test [dir] [--filter <text>] [--no-build] [--json]" },
  {
    name: "render",
    summary: "Simulate to a tick and write that frame as SVG.",
    usage: "moonstage render [dir] [--tick <n>] [--scene <id>] [--seed <n>] [--output <file|->] [--no-build] [--json]",
  },
  {
    name: "scene",
    summary: "Print a scene's source JSON.",
    usage: "moonstage scene [dir] [--scene <id>] [--json]",
  },
  {
    name: "edit",
    summary: "Apply semantic operations to a scene; validates the whole project before writing.",
    usage: "moonstage edit [dir] [--scene <id>] (--op '<json>' | --ops <file|->) [--dry-run] [--json]",
  },
  {
    name: "mcp",
    summary: "Serve Moonstage operations to agents over the Model Context Protocol (stdio).",
    usage: "moonstage mcp",
  },
  {
    name: "plugin",
    summary: "Create a plugin package, or check a plugin against the conformance suite.",
    usage: "moonstage plugin new <dir> [--name <name>] | moonstage plugin check <path> [--json]",
  },
  { name: "schemas", summary: "Print the JSON schemas, or write them to a directory.", usage: "moonstage schemas [--write] [--out <dir>] [--json]" },
];

// ---------------------------------------------------------------- describe

export function describe(): CommandResult {
  const components = Object.entries(
    ((sceneSchema.$defs as Record<string, Record<string, unknown>>).components!.properties ?? {}) as Record<
      string,
      { description?: string }
    >,
  ).map(([name, s]) => ({ name, description: s.description ?? "" }));
  const data = {
    moonstage: {
      cliVersion: CLI_VERSION,
      projectFormat: PROJECT_FORMAT,
      pluginApi: PLUGIN_API,
      behaviorAbi: BEHAVIOR_ABI,
      status: "early development; project, plugin and ABI contracts may change",
    },
    toolchain: { moon: findMoon() ?? null },
    commands: COMMANDS,
    components,
    behaviorAbi: {
      version: BEHAVIOR_ABI,
      importModule: "moonstage",
      imports: HOST_FUNCTIONS,
      exports: REQUIRED_EXPORTS,
      transformFields: TRANSFORM_FIELDS,
      docs: "docs/behavior-abi.md",
    },
    plugin: { apiLevel: PLUGIN_API, capabilities: CAPABILITIES, docs: "docs/plugins.md" },
    exitCodes: EXIT,
    diagnosticCodes: DIAGNOSTIC_CODES,
    schemas: Object.keys(SCHEMAS),
  };
  return result({
    data,
    lines: [
      `Moonstage CLI ${CLI_VERSION} (early development)`,
      `project format ${PROJECT_FORMAT} · plugin API ${PLUGIN_API} · behavior ABI ${BEHAVIOR_ABI}`,
      `MoonBit toolchain: ${data.toolchain.moon ?? "not found"}`,
      "",
      "Commands:",
      ...COMMANDS.map((c) => `  ${c.name.padEnd(9)} ${c.summary}`),
      "",
      "Components:",
      ...components.map((c) => `  ${c.name.padEnd(9)} ${c.description}`),
      "",
      "Use --json for the full machine-readable description.",
    ],
  });
}

// ---------------------------------------------------------------- schemas

export async function schemas(opts: { write?: boolean; out?: string }): Promise<CommandResult> {
  if (!opts.write) return result({ data: { schemas: SCHEMAS }, lines: [JSON.stringify(SCHEMAS, null, 2)] });
  const out = resolve(opts.out ?? "schemas");
  await mkdir(out, { recursive: true });
  const files: string[] = [];
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const file = join(out, `${name}.schema.json`);
    await writeFile(file, `${JSON.stringify(schema, null, 2)}\n`);
    files.push(file);
  }
  return result({ data: { files }, lines: files.map((f) => `wrote ${f}`) });
}

// ---------------------------------------------------------------- new

const TEMPLATE_DIR = join(here, "..", "templates");

/** Copy a template into an empty directory, filling in placeholders. */
async function scaffold(
  template: string,
  dir: string | undefined,
  name: string | undefined,
  usage: string,
  fallbackSlug: string,
  extra: Record<string, string> = {},
): Promise<{ target: string; name: string; files: string[] } | CommandResult> {
  if (dir === undefined) {
    return result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", `missing <dir>: ${usage}`)] });
  }
  const target = resolve(dir);
  if (existsSync(target) && (await readdir(target)).length > 0) {
    return result({
      exitCode: EXIT.usage,
      diagnostics: [diagnostic("MS9001", `${target} already exists and is not empty`)],
    });
  }
  const source = join(TEMPLATE_DIR, template);
  if (!existsSync(source)) {
    return result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", `unknown template "${template}"`)] });
  }
  const display = name ?? basename(target);
  const slug = display.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || fallbackSlug;
  // Template placeholders: __NAME__ (display name), __SLUG__ (module-safe name), plus `extra`.
  const replacements: Record<string, string> = { __NAME__: display, __SLUG__: slug, ...extra };
  await cp(source, target, { recursive: true });
  const files: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        let text = await readFile(path, "utf8");
        for (const [key, value] of Object.entries(replacements)) text = text.replaceAll(key, value);
        await writeFile(path, text);
        files.push(relative(target, path).split("\\").join("/"));
      }
    }
  };
  await walk(target);
  // npm strips .gitignore from published packages, so templates ship "gitignore".
  if (existsSync(join(target, "gitignore"))) {
    await rename(join(target, "gitignore"), join(target, ".gitignore"));
    files.splice(files.indexOf("gitignore"), 1, ".gitignore");
  }
  return { target, name: display, files };
}

export async function create(opts: { dir?: string; name?: string; template?: string }): Promise<CommandResult> {
  const template = opts.template ?? "minimal";
  const made = await scaffold(template, opts.dir, opts.name, "moonstage new <dir>", "game");
  if ("exitCode" in made) return made;
  const { target, name, files } = made;
  const manifest = JSON.parse(await readFile(join(target, "moonstage.json"), "utf8"));
  files.push(...(await writeSlotFiles(target, manifest)));
  files.sort();
  return result({
    data: { root: target, template, files, next: ["moonstage validate", "moonstage test", "moonstage run"] },
    lines: [
      `Created ${name} in ${target}`,
      ...files.map((f) => `  ${f}`),
      "",
      "Next:",
      `  cd ${relative(process.cwd(), target) || "."}`,
      "  moonstage test      # build behaviors and run headless tests",
      "  moonstage run       # play in the browser",
    ],
  });
}

// ---------------------------------------------------------------- plugin

function packageVersion(specifier: string): string {
  const dist = dirname(fileURLToPath(import.meta.resolve(specifier)));
  return (JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8")) as { version: string }).version;
}

export async function pluginNew(opts: { dir?: string; name?: string }): Promise<CommandResult> {
  const made = await scaffold("plugin", opts.dir, opts.name, "moonstage plugin new <dir>", "plugin", {
    __CORE_VERSION__: packageVersion("@moonstage/core"),
    __CLI_VERSION__: CLI_VERSION,
  });
  if ("exitCode" in made) return made;
  const { target, name, files } = made;
  files.sort();
  return result({
    data: { root: target, files, next: ["npm install", "moonstage plugin check ."] },
    lines: [
      `Created plugin ${name} in ${target}`,
      ...files.map((f) => `  ${f}`),
      "",
      "Next:",
      `  cd ${relative(process.cwd(), target) || "."}`,
      "  moonstage plugin check .   # run the conformance suite",
      "  npm install && npm test    # the same suite through node:test",
    ],
  });
}

/** Resolve a plugin path: a module file, or a package directory (exports, main, index.js). */
function pluginEntry(path: string): string {
  const abs = resolve(path);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return abs;
  try {
    const pkg = JSON.parse(readFileSync(join(abs, "package.json"), "utf8")) as { exports?: unknown; main?: string };
    const exported = typeof pkg.exports === "string" ? pkg.exports : (pkg.exports as Record<string, unknown> | undefined)?.["."];
    const entry = typeof exported === "string" ? exported : (exported as { default?: string } | undefined)?.default;
    return join(abs, entry ?? pkg.main ?? "index.js");
  } catch {
    return join(abs, "index.js");
  }
}

export async function pluginCheck(opts: { path?: string }): Promise<CommandResult> {
  if (opts.path === undefined) {
    return result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", "missing <path>: moonstage plugin check <path>")] });
  }
  const entry = pluginEntry(opts.path);
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  } catch (err) {
    return result({
      diagnostics: [diagnostic("MS4001", `could not import ${entry}: ${(err as Error).message}`, { file: entry })],
      data: { module: entry },
    });
  }
  const plugin = mod.default ?? mod.plugin;
  const fixture = (mod.conformance ?? {}) as ConformanceFixture;
  const report = await checkPluginConformance(plugin, fixture);
  return result({
    ok: report.passed,
    diagnostics: report.checks.flatMap((c) => c.diagnostics),
    data: { module: entry, plugin: report.plugin, passed: report.passed, checks: report.checks },
    lines: [
      `${report.plugin} (${relative(process.cwd(), entry) || entry})`,
      ...report.checks.map((c) => `${c.skipped ? "-" : c.passed ? "✓" : "✗"} ${c.name.padEnd(13)} ${c.description}`),
      "",
      report.passed ? "conforms to the Moonstage plugin contract" : "does not conform; see the diagnostics below",
    ],
  });
}

// ---------------------------------------------------------------- validate

export async function validate(opts: { dir?: string }): Promise<CommandResult> {
  const { root, diagnostics: rootIssues } = projectRoot(opts.dir);
  if (rootIssues.length > 0) return result({ diagnostics: rootIssues, exitCode: EXIT.usage });
  const loaded = await load(root, { behaviors: "optional" });
  const tests = await loadTests(root);
  const slots = loaded.manifest ? [...slotCollisions(loaded.manifest), ...(await staleSlotFiles(root, loaded.manifest))] : [];
  const assets = Object.entries(loaded.manifest?.assets ?? {})
    .filter(([, asset]) => !existsSync(join(root, asset.path)))
    .map(([id, asset]) =>
      diagnostic("MS1003", `asset "${id}": ${asset.path} not found`, { file: "moonstage.json", path: `assets.${id}.path` }),
    );
  const diagnostics = [...loaded.diagnostics, ...slots, ...assets, ...tests.flatMap((t) => t.diagnostics)];
  const entities = Object.values(loaded.scenes).reduce((n, s) => n + s.entities.length, 0);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return result({
    diagnostics,
    data: {
      root,
      project: loaded.manifest?.name ?? null,
      scenes: Object.keys(loaded.scenes).length,
      entities,
      tests: tests.length,
      errors,
      warnings,
    },
    lines: [
      errors === 0
        ? `✓ ${loaded.manifest?.name}: ${Object.keys(loaded.scenes).length} scene(s), ${entities} entities, ${tests.length} test file(s) — valid${warnings ? ` (${warnings} warning(s))` : ""}`
        : `✗ ${errors} error(s), ${warnings} warning(s)`,
    ],
  });
}

// ---------------------------------------------------------------- inspect

export async function inspect(opts: { dir?: string }): Promise<CommandResult> {
  const { root, diagnostics: rootIssues } = projectRoot(opts.dir);
  if (rootIssues.length > 0) return result({ diagnostics: rootIssues, exitCode: EXIT.usage });
  const loaded = await load(root, { behaviors: "optional" });
  const manifest = loaded.manifest;
  if (manifest === undefined) return result({ diagnostics: loaded.diagnostics });

  const scenes = Object.fromEntries(
    Object.entries(loaded.scenes).map(([id, scene]) => [
      id,
      {
        file: manifest.scenes[id],
        camera: scene.camera ?? null,
        entities: scene.entities.map((e) => ({
          id: e.id,
          ...(e.name !== undefined && { name: e.name }),
          parent: e.parent ?? null,
          active: e.active ?? true,
          components: Object.keys(e.components ?? {}),
          behaviors: behaviorsOf(e.components).map((b) => b.module),
          extensions: Object.keys(e.extensions ?? {}),
        })),
      },
    ]),
  );
  const behaviors = Object.fromEntries(
    Object.entries(manifest.behaviors ?? {}).map(([name, decl]) => {
      const wasm = behaviorWasmPath(name, decl);
      return [name, { ...decl, language: decl.language ?? (decl.source ? "moonbit" : "wasm"), wasm, built: existsSync(join(root, wasm)) }];
    }),
  );
  const tests = (await loadTests(root)).map((t) => ({ file: t.file, name: t.test?.name ?? null, valid: t.diagnostics.length === 0 }));
  const data = {
    root,
    name: manifest.name,
    description: manifest.description ?? null,
    format: manifest.format,
    entryScene: manifest.entryScene,
    display: manifest.display ?? {},
    simulation: manifest.simulation ?? {},
    input: manifest.input ?? {},
    scenes,
    behaviors,
    prefabs: Object.fromEntries(
      Object.entries(manifest.prefabs ?? {}).map(([name, p]) => [
        name,
        { components: Object.keys(p.components ?? {}), behaviors: behaviorsOf(p.components).map((b) => b.module) },
      ]),
    ),
    plugins: manifest.plugins ?? {},
    tests,
  };
  const lines = [
    `${manifest.name} (format ${manifest.format})${manifest.description ? ` — ${manifest.description}` : ""}`,
    `entry scene: ${manifest.entryScene}`,
    "",
    "Scenes:",
    ...Object.entries(scenes).flatMap(([id, s]) => [
      `  ${id} (${s.file}, ${s.entities.length} entities${s.camera ? `, camera: ${s.camera}` : ""})`,
      ...s.entities.map(
        (e) =>
          `    ${e.parent ? "  " : ""}${e.id}${e.active ? "" : " (inactive)"}: ${e.components.join(", ")}${e.extensions.length ? ` +ext ${e.extensions.join(", ")}` : ""}`,
      ),
    ]),
    "",
    "Behaviors:",
    ...Object.entries(behaviors).map(([n, b]) => `  ${n} (${b.language}${b.source ? `, ${b.source}` : ""}) ${b.built ? "built" : "not built"}`),
    "",
    "Prefabs:",
    ...Object.entries(data.prefabs).map(([n, p]) => `  ${n}: ${p.components.join(", ")}`),
    "",
    "Plugins:",
    ...Object.entries(manifest.plugins ?? {}).map(([n, p]) => `  ${n}: ${p.module}`),
    "",
    `Tests: ${tests.map((t) => t.file).join(", ") || "none"}`,
  ];
  return result({ data, diagnostics: loaded.diagnostics, lines });
}

// ---------------------------------------------------------------- scene / edit

/** Return one scene's source JSON (default: the entry scene). */
export async function getScene(opts: { dir?: string; scene?: string }): Promise<CommandResult> {
  const { root, diagnostics: rootIssues } = projectRoot(opts.dir);
  if (rootIssues.length > 0) return result({ diagnostics: rootIssues, exitCode: EXIT.usage });
  const loaded = await load(root, { behaviors: "skip", plugins: "skip" });
  const sceneId = opts.scene ?? loaded.manifest?.entryScene ?? "";
  const scene = loaded.scenes[sceneId];
  if (scene === undefined) {
    return result({ diagnostics: [...loaded.diagnostics, diagnostic("MS2004", `scene "${sceneId}" is not loaded`)] });
  }
  return result({
    data: { root, scene: sceneId, file: loaded.manifest!.scenes[sceneId], source: scene },
    diagnostics: loaded.diagnostics,
    lines: [JSON.stringify(scene, null, 2)],
  });
}

/**
 * Apply semantic operations to a scene file. The result is validated against
 * the whole project before anything is written; on errors nothing changes.
 */
export async function editScene(opts: {
  dir?: string;
  scene?: string;
  operations?: unknown;
  dryRun?: boolean;
}): Promise<CommandResult> {
  const { root, diagnostics: rootIssues } = projectRoot(opts.dir);
  if (rootIssues.length > 0) return result({ diagnostics: rootIssues, exitCode: EXIT.usage });
  const ops = Array.isArray(opts.operations) ? opts.operations : opts.operations === undefined ? [] : [opts.operations];
  if (ops.length === 0) {
    return result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", "no operations: pass --op '<json>' or --ops <file|->")] });
  }
  const shape = ops.flatMap((op, i) =>
    validateSchema(operationSchema, op).map((issue) =>
      diagnostic("MS5003", `operations[${i}] ${issue.path}: ${issue.message}`, { path: `operations[${i}]` }),
    ),
  );
  if (shape.length > 0) return result({ diagnostics: shape });

  const loaded = await load(root, { behaviors: "skip", plugins: "skip" });
  const manifest = loaded.manifest;
  const sceneId = opts.scene ?? manifest?.entryScene ?? "";
  const before = loaded.scenes[sceneId];
  if (manifest === undefined || before === undefined) {
    return result({ diagnostics: [...loaded.diagnostics, diagnostic("MS2004", `scene "${sceneId}" is not loaded`)] });
  }
  const file = manifest.scenes[sceneId]!;
  let after: SceneSource;
  try {
    after = applyOperations(before, ops as Operation[]);
  } catch (err) {
    if (err instanceof MoonstageError) return result({ diagnostics: err.diagnostics });
    throw err;
  }
  const diagnostics = [
    ...validateSceneShape(after, file),
    ...validateProjectSemantics(manifest, { ...loaded.scenes, [sceneId]: after }).filter(
      (d) => d.file === undefined || d.file === file || d.file === "moonstage.json",
    ),
  ];
  const ok = !hasErrors(diagnostics);
  const write = ok && !opts.dryRun;
  if (write) await writeFile(join(root, file), `${JSON.stringify(after, null, 2)}\n`);
  const ids = (s: SceneSource) => new Set(s.entities.map((e) => e.id));
  const [old, now] = [ids(before), ids(after)];
  return result({
    diagnostics,
    data: {
      root,
      scene: sceneId,
      file,
      operations: ops.length,
      written: write,
      added: [...now].filter((id) => !old.has(id)),
      removed: [...old].filter((id) => !now.has(id)),
      entities: after.entities.length,
    },
    lines: [
      ok
        ? `${write ? "applied" : "would apply"} ${ops.length} operation(s) to ${file}${opts.dryRun ? " (dry run)" : ""}`
        : `not written: the edited scene has errors`,
    ],
  });
}

// ---------------------------------------------------------------- build

interface Prepared {
  root: string;
  project?: LoadedProject;
  diagnostics: Diagnostic[];
  exitCode?: CommandResult["exitCode"];
  behaviors: { name: string; output: string; bytes: number }[];
}

/** Validate, compile MoonBit behaviors (unless skipped) and load the project ready to run. */
async function prepare(dir: string | undefined, compile: boolean): Promise<Prepared> {
  const { root, diagnostics: rootIssues } = projectRoot(dir);
  if (rootIssues.length > 0) return { root, diagnostics: rootIssues, exitCode: EXIT.usage, behaviors: [] };
  const first = await load(root, { behaviors: "skip", plugins: "skip" });
  if (hasErrors(first.diagnostics) || first.manifest === undefined) {
    return { root, diagnostics: first.diagnostics, behaviors: [] };
  }
  let behaviors: Prepared["behaviors"] = [];
  if (compile) {
    const collisions = slotCollisions(first.manifest);
    if (collisions.length > 0) return { root, diagnostics: [...first.diagnostics, ...collisions], behaviors };
    await writeSlotFiles(root, first.manifest);
    const built = await buildMoonbitBehaviors(root, first.manifest);
    behaviors = built.behaviors;
    if (hasErrors(built.diagnostics)) {
      return {
        root,
        diagnostics: [...first.diagnostics, ...built.diagnostics],
        behaviors,
        ...(built.environmentError && { exitCode: EXIT.environment }),
      };
    }
  }
  const loaded = await load(root, { behaviors: "require" });
  return loaded.project
    ? { root, project: loaded.project, diagnostics: loaded.diagnostics, behaviors }
    : { root, diagnostics: loaded.diagnostics, behaviors };
}

function failed(p: Prepared): CommandResult {
  return result({ diagnostics: p.diagnostics, ...(p.exitCode !== undefined && { exitCode: p.exitCode }), data: { root: p.root } });
}

export async function build(opts: { dir?: string; out?: string; bundle?: boolean }): Promise<CommandResult> {
  const p = await prepare(opts.dir, true);
  if (p.project === undefined) return failed(p);
  const data: Record<string, unknown> = { root: p.root, behaviors: p.behaviors };
  const lines = p.behaviors.map((b) => `compiled ${b.name} -> ${b.output} (${b.bytes} bytes)`);
  if (opts.bundle !== false) {
    const out = resolve(p.root, opts.out ?? "dist");
    await writeBundle(p.root, p.project.manifest, out);
    data.bundle = out;
    lines.push(`web bundle -> ${out}`);
  }
  return result({ data, diagnostics: p.diagnostics, lines });
}

// ---------------------------------------------------------------- run

function int(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new MoonstageError([diagnostic("MS9001", `--${name} must be a non-negative integer`)]);
  return n;
}

async function simulate(project: LoadedProject, opts: { scene?: string; seed?: string; ticks: number; input?: string }) {
  const input = opts.input ? (JSON.parse(opts.input) as Record<string, number>) : {};
  const rt = await Runtime.create(project, {
    ...(opts.scene !== undefined && { scene: opts.scene }),
    ...(opts.seed !== undefined && { seed: int(opts.seed, "seed", 1) }),
  });
  for (const [name, value] of Object.entries(input)) rt.input.set(name, value);
  rt.start();
  for (let i = 0; i < opts.ticks; i++) rt.step();
  return rt;
}

export async function runCommand(opts: {
  dir?: string;
  headless?: boolean;
  ticks?: string;
  seed?: string;
  scene?: string;
  input?: string;
  port?: string;
  build?: boolean;
}): Promise<CommandResult & { server?: import("node:http").Server }> {
  if (!opts.headless) {
    const built = await build({ dir: opts.dir });
    if (!built.ok) return built;
    const { server, url } = await serve(built.data.bundle as string, int(opts.port, "port", 5173));
    return { ...result({ data: { ...built.data, url }, lines: [...built.lines, "", `Playing at ${url}  (Ctrl+C to stop)`] }), server };
  }
  const p = await prepare(opts.dir, opts.build !== false);
  if (p.project === undefined) return failed(p);
  const ticks = int(opts.ticks, "ticks", 600);
  const rt = await simulate(p.project, { ...opts, ticks });
  const eventCounts: Record<string, number> = {};
  for (const e of rt.events) eventCounts[e.name] = (eventCounts[e.name] ?? 0) + 1;
  const snapshot = rt.snapshot();
  rt.stop();
  rt.dispose();
  return result({
    diagnostics: [...p.diagnostics, ...rt.diagnostics],
    data: {
      root: p.root,
      scene: rt.sceneId,
      seed: rt.random.seed,
      ticks: rt.tick,
      simulatedSeconds: rt.elapsed,
      eventCounts,
      events: rt.events.slice(0, 200),
      logs: rt.logs.slice(0, 200),
      snapshot,
    },
    lines: [
      `simulated ${rt.tick} ticks (${rt.elapsed.toFixed(2)}s) of scene "${rt.sceneId}" with seed ${rt.random.seed}`,
      `events: ${Object.entries(eventCounts).map(([n, c]) => `${n}×${c}`).join(", ") || "none"}`,
      ...(rt.diagnostics.length > 0 ? [`${rt.diagnostics.length} runtime problem(s)`] : []),
      "Use --json for the full snapshot.",
    ],
  });
}

// ---------------------------------------------------------------- test

export async function test(opts: { dir?: string; filter?: string; build?: boolean }): Promise<CommandResult> {
  const p = await prepare(opts.dir, opts.build !== false);
  if (p.project === undefined) return failed(p);
  const files = (await loadTests(p.root)).filter(
    (t) => opts.filter === undefined || t.file.includes(opts.filter) || t.test?.name.includes(opts.filter),
  );
  const results: TestResult[] = [];
  const diagnostics: Diagnostic[] = [...p.diagnostics];
  for (const f of files) {
    if (f.test === undefined) {
      diagnostics.push(...f.diagnostics);
      results.push({ name: f.file, file: f.file, passed: false, ticks: 0, diagnostics: f.diagnostics, events: 0 });
      continue;
    }
    results.push(await runTest(p.project, f.test, f.file));
  }
  for (const r of results) if (r.file !== undefined && files.find((f) => f.file === r.file)?.test) diagnostics.push(...r.diagnostics);
  const passed = results.filter((r) => r.passed).length;
  const ok = passed === results.length && !hasErrors(diagnostics);
  return result({
    ok,
    diagnostics,
    data: {
      root: p.root,
      passed,
      failed: results.length - passed,
      // Snapshots are large; leave them out of the summary.
      results: results.map(({ snapshot: _snapshot, ...r }) => r),
    },
    lines: [
      ...results.map((r) => `${r.passed ? "✓" : "✗"} ${r.name}${r.file ? `  (${r.file})` : ""}`),
      "",
      results.length === 0 ? "no tests found in tests/*.test.json" : `${passed}/${results.length} passed`,
    ],
  });
}

// ---------------------------------------------------------------- render

export async function render(opts: {
  dir?: string;
  tick?: string;
  scene?: string;
  seed?: string;
  output?: string;
  input?: string;
  build?: boolean;
}): Promise<CommandResult & { svg?: string }> {
  const p = await prepare(opts.dir, opts.build !== false);
  if (p.project === undefined) return failed(p);
  const ticks = int(opts.tick, "tick", 0);
  const rt = await simulate(p.project, { ...opts, ticks });
  const frame = rt.frame(1);
  const images = new Map<string, SvgImage>();
  for (const [id, asset] of Object.entries(p.project.manifest.assets ?? {})) {
    if (!isImageAsset(asset)) continue;
    try {
      images.set(id, svgImage(new Uint8Array(await readFile(join(p.root, asset.path))), asset.path, asset.pixelated));
    } catch {
      // Drawn as a magenta placeholder; `moonstage validate` reports the missing file.
    }
  }
  const svg = renderSvg(frame, images);
  rt.dispose();
  const data: Record<string, unknown> = {
    root: p.root,
    scene: rt.sceneId,
    tick: frame.tick,
    camera: frame.camera,
    items: frame.items.length,
    entities: [...new Set(frame.items.map((i) => i.entity))],
  };
  if (opts.output === "-") {
    return { ...result({ data, diagnostics: [...p.diagnostics, ...rt.diagnostics], lines: [svg] }), svg };
  }
  const output = resolve(opts.output ?? join(p.root, ".moonstage", "render", `${rt.sceneId}-${frame.tick}.svg`));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, svg);
  data.output = output;
  return {
    ...result({
      data,
      diagnostics: [...p.diagnostics, ...rt.diagnostics],
      lines: [`rendered scene "${rt.sceneId}" at tick ${frame.tick} (${frame.items.length} items) -> ${output}`],
    }),
    svg,
  };
}
