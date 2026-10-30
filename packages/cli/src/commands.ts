/**
 * Command implementations. Each command takes parsed options and returns a
 * CommandResult; it never prints or exits on its own, so commands are easy to
 * test and to wrap (e.g. by a future MCP server).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
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
  MSP_FORMAT,
  readZip,
  operationSchema,
  validateProjectSemantics,
  validateSceneShape,
  validateSchema,
  type Operation,
  type ProjectManifest,
  type SceneSource,
  runTest,
  sceneSchema,
  type ConformanceFixture,
  type Diagnostic,
  type LoadedProject,
  type TestResult,
} from "@moonstage/core";
import { runtimeFiles, serve, writeBundle } from "./bundle.js";
import { singleFileHtml } from "./single-file.js";
import { writeZip } from "./zip.js";
import { buildMoonbitBehaviors, findMoon } from "./moonbit.js";
import { EXIT, result, type CommandResult } from "./output.js";
import { ioFor, isPackage, load, loadTests, projectRoot, resolvePlugin } from "./project-io.js";
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
  {
    name: "new",
    summary: "Create a new project from a template: minimal (default), platformer or shooter.",
    usage: "moonstage new <dir> [--template minimal|platformer|shooter] [--name <name>] [--json]",
  },
  { name: "validate", summary: "Validate project files, references, plugins and tests.", usage: "moonstage validate [dir] [--json]" },
  { name: "inspect", summary: "Summarize scenes, entities, behaviors and plugins.", usage: "moonstage inspect [dir] [--json]" },
  { name: "build", summary: "Compile MoonBit behaviors and write a static web bundle.", usage: "moonstage build [dir] [--out <dir|file.html>] [--no-bundle] [--single-file] [--json]" },
  {
    name: "run",
    summary: "Play in the browser (local server) or simulate headlessly.",
    usage: "moonstage run [dir] [--headless --ticks <n> --seed <n> --scene <id> --input <json> --input-script <json|file>] [--port <n>] [--no-build] [--json]",
  },
  { name: "test", summary: "Run tests/*.test.json headlessly.", usage: "moonstage test [dir] [--filter <text>] [--no-build] [--json]" },
  {
    name: "render",
    summary: "Simulate to a tick and write that frame as SVG.",
    usage: "moonstage render [dir] [--tick <n>] [--scene <id>] [--seed <n>] [--input <json>] [--input-script <json|file>] [--output <file|->] [--no-build] [--json]",
  },
  {
    name: "guide",
    summary: "Read the bundled skills and docs (start with `moonstage guide build-game`).",
    usage: "moonstage guide [topic] [--json]",
  },
  {
    name: "pack",
    summary: "Build and write an .msp package (ZIP) of the project's runtime files.",
    usage: "moonstage pack [dir] [--out <file.msp>] [--json]",
  },
  {
    name: "unpack",
    summary: "Extract an .msp package into a runnable project directory.",
    usage: "moonstage unpack <file.msp> [dir] [--json]",
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
    templates: TEMPLATES,
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

// ---------------------------------------------------------------- guide

/** Docs and skills: copied into the published package (guide/), or read from the monorepo. */
function guideDirs(): { docs: string; skills: string } | undefined {
  for (const root of [join(here, "..", "guide"), join(here, "..", "..", "..")]) {
    if (existsSync(join(root, "docs")) && existsSync(join(root, "skills"))) return { docs: join(root, "docs"), skills: join(root, "skills") };
  }
  return undefined;
}

interface GuideTopic {
  name: string;
  kind: "skill" | "doc";
  description: string;
  path: string;
}

async function guideTopics(): Promise<GuideTopic[]> {
  const dirs = guideDirs();
  if (dirs === undefined) return [];
  const topics: GuideTopic[] = [];
  for (const entry of await readdir(dirs.skills, { withFileTypes: true })) {
    const path = join(dirs.skills, entry.name, "SKILL.md");
    if (!entry.isDirectory() || !existsSync(path)) continue;
    const text = await readFile(path, "utf8");
    topics.push({ name: entry.name, kind: "skill", description: /^description:\s*(.+)$/m.exec(text)?.[1] ?? "", path });
  }
  for (const name of (await readdir(dirs.docs)).filter((n) => n.endsWith(".md")).sort()) {
    const path = join(dirs.docs, name);
    const lines = (await readFile(path, "utf8")).split("\n").map((l) => l.trim());
    const first = lines.find((l) => l !== "" && !l.startsWith("#") && !l.startsWith(">")) ?? "";
    topics.push({ name: name.replace(/\.md$/, ""), kind: "doc", description: first, path });
  }
  return topics;
}

/** List the guide's topics, or print one: task skills and reference docs, bundled with the CLI. */
export async function guide(opts: { topic?: string }): Promise<CommandResult> {
  const topics = await guideTopics();
  if (opts.topic === undefined) {
    return result({
      data: { topics: topics.map(({ path: _path, ...t }) => t) },
      lines: [
        "Moonstage guide. Start with `moonstage guide build-game`.",
        "",
        "Skills (step-by-step procedures):",
        ...topics.filter((t) => t.kind === "skill").map((t) => `  ${t.name.padEnd(16)} ${t.description}`),
        "",
        "Reference:",
        ...topics.filter((t) => t.kind === "doc").map((t) => `  ${t.name.padEnd(16)} ${t.description.slice(0, 90)}`),
        "",
        "Read one with `moonstage guide <topic>`.",
      ],
    });
  }
  const topic = topics.find((t) => t.name === opts.topic);
  if (topic === undefined) {
    return result({
      exitCode: EXIT.usage,
      diagnostics: [diagnostic("MS9001", `unknown guide topic "${opts.topic}"; topics: ${topics.map((t) => t.name).join(", ")}`)],
    });
  }
  const content = await readFile(topic.path, "utf8");
  return result({ data: { topic: topic.name, kind: topic.kind, content }, lines: [content] });
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

/** Project templates for `moonstage new --template`. "plugin" is used by `moonstage plugin new`. */
export const TEMPLATES = {
  minimal: "One moving square and a MoonBit behavior: the smallest working project.",
  platformer: "Run, jump and collect coins on physics platforms, with a following camera and a saved best score.",
  shooter: "Move, fire and destroy falling enemies; lives, game-over scene, restart and a saved best score.",
} as const;

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
  if (!(template in TEMPLATES)) {
    return result({
      exitCode: EXIT.usage,
      diagnostics: [diagnostic("MS9001", `unknown template "${template}"; templates: ${Object.keys(TEMPLATES).join(", ")}`)],
    });
  }
  const made = await scaffold(template, opts.dir, opts.name, "moonstage new <dir>", "game");
  if ("exitCode" in made) return made;
  const { target, name, files } = made;
  const manifest = JSON.parse(await readFile(join(target, "moonstage.json"), "utf8"));
  files.push(...(await writeSlotFiles(target, manifest)));
  files.sort();
  return result({
    data: { root: target, template, files, next: ["moonstage guide build-game", "moonstage validate", "moonstage test", "moonstage run"] },
    lines: [
      `Created ${name} in ${target}`,
      ...files.map((f) => `  ${f}`),
      "",
      "Next:",
      `  cd ${relative(process.cwd(), target) || "."}`,
      "  moonstage guide build-game   # how to build a game here (MoonBit primer: guide moonbit)",
      "  moonstage test               # build behaviors and run headless tests",
      "  moonstage run                # play in the browser",
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
  // A package holds runtime files only, so source-level checks apply to directories.
  const source = !isPackage(root);
  const slots = loaded.manifest && source ? [...slotCollisions(loaded.manifest), ...(await staleSlotFiles(root, loaded.manifest))] : [];
  const io = await ioFor(root);
  const missing = await Promise.all(
    Object.entries(loaded.manifest?.assets ?? {}).map(async ([id, asset]) => ((await io.readBytes(asset.path)) === undefined ? [[id, asset] as const] : [])),
  );
  const assets = missing
    .flat()
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
  const io = await ioFor(root);
  const behaviors = Object.fromEntries(
    await Promise.all(
      Object.entries(manifest.behaviors ?? {}).map(async ([name, decl]) => {
        const wasm = behaviorWasmPath(name, decl);
        const built = (await io.readBytes(wasm)) !== undefined;
        return [name, { ...decl, language: decl.language ?? (decl.source ? "moonbit" : "wasm"), wasm, built }] as const;
      }),
    ),
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
  if (isPackage(root)) return readOnlyPackage(root);
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
  if (compile && !isPackage(root)) {
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

function readOnlyPackage(root: string): CommandResult {
  return result({
    exitCode: EXIT.usage,
    diagnostics: [diagnostic("MS9001", `${root} is a package; run \`moonstage unpack\` to get an editable project`)],
  });
}

export async function build(opts: { dir?: string; out?: string; bundle?: boolean; singleFile?: boolean }): Promise<CommandResult> {
  if (opts.dir !== undefined && isPackage(resolve(opts.dir))) return readOnlyPackage(resolve(opts.dir));
  const p = await prepare(opts.dir, true);
  if (p.project === undefined) return failed(p);
  if (opts.singleFile) {
    const { zip, manifest } = await packageProject(p.root, p.project.manifest);
    const packaged = Object.entries(manifest.plugins ?? {}).filter(([, d]) => !d.module.startsWith("./"));
    if (packaged.length > 0) {
      return result({
        diagnostics: [
          diagnostic("MS9001", `--single-file needs self-contained plugins; ${packaged.map(([n]) => n).join(", ")} ${packaged.length === 1 ? "imports" : "import"} other modules`, {
            hint: "Use the folder bundle (`moonstage build`) for projects with such npm plugins (e.g. @moonstage/rive).",
          }),
        ],
      });
    }
    const html = await singleFileHtml(manifest.name, manifest.display ?? {}, zip);
    const output = resolve(p.root, opts.out ?? join("dist", `${manifest.name}.html`));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html);
    return result({
      diagnostics: p.diagnostics,
      data: { root: p.root, behaviors: p.behaviors, output, bytes: Buffer.byteLength(html) },
      lines: [`single-file game -> ${output} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB); open it in any browser`],
    });
  }
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

// ---------------------------------------------------------------- pack / unpack

/**
 * Write an .msp package: the project's runtime files plus msp.json. Behaviors
 * are stored as plain WebAssembly (behaviors/<name>.wasm) and the packaged
 * manifest points at them, so a package needs no MoonBit sources or toolchain.
 */
export async function pack(opts: { dir?: string; out?: string }): Promise<CommandResult> {
  const p = await prepare(opts.dir, true);
  if (p.project === undefined) return failed(p);
  const { zip, entries, manifest } = await packageProject(p.root, p.project.manifest);
  const output = resolve(opts.out ?? join(p.root, `${manifest.name}.msp`));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, zip);
  return result({
    diagnostics: p.diagnostics,
    data: { root: p.root, output, bytes: zip.length, files: entries.map((e) => e.path) },
    lines: [`packed ${entries.length} files -> ${output} (${(zip.length / 1024).toFixed(1)} KB)`],
  });
}

/** Build the .msp bytes for a compiled project (shared by pack and single-file builds). */
async function packageProject(root: string, source: ProjectManifest) {
  const manifest = structuredClone(source);
  const entries: { path: string; data: Uint8Array }[] = [];
  const moves = new Map<string, string>();
  for (const [name, decl] of Object.entries(manifest.behaviors ?? {})) {
    const packaged = `behaviors/${name}.wasm`;
    moves.set(behaviorWasmPath(name, decl), packaged);
    delete decl.source;
    decl.language = "wasm";
    decl.wasm = packaged;
  }
  // Package plugins that are a single self-contained module (no imports) travel inside the package,
  // so .msp files and single-file games need no npm install or import map.
  const vendored: { path: string; data: Uint8Array }[] = [];
  for (const [name, decl] of Object.entries(manifest.plugins ?? {})) {
    if (decl.module.startsWith(".") || decl.module.startsWith("/")) continue;
    const entry = resolvePlugin(root, decl.module);
    if (entry === undefined) continue;
    const code = await readFile(entry, "utf8");
    if (/^\s*(import\s|export\s[^;]*\sfrom\s)/m.test(code)) continue;
    const path = `plugins/${name.replace(/^@/, "").replace(/[^A-Za-z0-9_.-]+/g, "-")}.js`;
    vendored.push({ path, data: Buffer.from(code) });
    decl.module = `./${path}`;
  }
  const metadata = { format: MSP_FORMAT, name: manifest.name, createdWith: `moonstage ${CLI_VERSION}` };
  entries.push({ path: "msp.json", data: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`) });
  entries.push({ path: "moonstage.json", data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) });
  for (const file of runtimeFiles(source)) {
    if (file === "moonstage.json") continue;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    entries.push({ path: moves.get(file) ?? file, data: new Uint8Array(await readFile(path)) });
  }
  entries.push(...vendored);
  return { zip: writeZip(entries), entries, manifest };
}

export async function unpack(opts: { file?: string; dir?: string }): Promise<CommandResult> {
  if (opts.file === undefined || !isPackage(resolve(opts.file))) {
    return result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", "usage: moonstage unpack <file.msp> [dir]")] });
  }
  const file = resolve(opts.file);
  const target = resolve(opts.dir ?? basename(file, ".msp"));
  if (existsSync(target) && (await readdir(target)).length > 0) {
    return result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", `${target} already exists and is not empty`)] });
  }
  let entries: Map<string, Uint8Array>;
  try {
    entries = await readZip(new Uint8Array(await readFile(file)));
  } catch (err) {
    if (err instanceof MoonstageError) return result({ diagnostics: err.diagnostics });
    throw err;
  }
  const written: string[] = [];
  for (const [path, data] of entries) {
    if (path === "msp.json") continue;
    const to = resolve(target, path);
    if (!to.startsWith(target + sep)) {
      return result({ diagnostics: [diagnostic("MS1005", `invalid .msp package: entry "${path}" points outside the package`)] });
    }
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, data);
    written.push(path);
  }
  return result({
    data: { root: target, files: written.sort() },
    lines: [`unpacked ${written.length} files into ${target}`],
  });
}

// ---------------------------------------------------------------- run

function int(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new MoonstageError([diagnostic("MS9001", `--${name} must be a non-negative integer`)]);
  return n;
}

/**
 * Input for a simulation: --input holds values for the whole run; --input-script is a timeline in the
 * same format as a test's `input` ([{ "tick": 0, "set": { "fire": 1 } }, ...]), inline JSON or a file path.
 */
function inputTimeline(opts: { input?: string; inputScript?: string }): { tick: number; set: Record<string, number> }[] {
  const timeline: { tick: number; set: Record<string, number> }[] = [];
  const parse = (text: string, flag: string): unknown => {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new MoonstageError([diagnostic("MS9001", `${flag} is not valid JSON: ${(err as Error).message}`)]);
    }
  };
  if (opts.input) timeline.push({ tick: 0, set: parse(opts.input, "--input") as Record<string, number> });
  if (opts.inputScript) {
    const source = opts.inputScript.trim().startsWith("[") ? opts.inputScript : readFileSync(resolve(opts.inputScript), "utf8");
    const steps = parse(source, "--input-script");
    if (!Array.isArray(steps) || !steps.every((s) => typeof s?.tick === "number" && typeof s?.set === "object")) {
      throw new MoonstageError([diagnostic("MS9001", `--input-script must be a list of { "tick": n, "set": { name: value } }`)]);
    }
    timeline.push(...(steps as { tick: number; set: Record<string, number> }[]));
  }
  return timeline.sort((a, b) => a.tick - b.tick);
}

async function simulate(
  project: LoadedProject,
  opts: { scene?: string; seed?: string; ticks: number; input?: string; inputScript?: string },
) {
  const timeline = inputTimeline(opts);
  const rt = await Runtime.create(project, {
    ...(opts.scene !== undefined && { scene: opts.scene }),
    ...(opts.seed !== undefined && { seed: int(opts.seed, "seed", 1) }),
  });
  rt.start();
  let next = 0;
  for (let i = 0; i < opts.ticks; i++) {
    while (next < timeline.length && timeline[next]!.tick <= i) {
      for (const [name, value] of Object.entries(timeline[next]!.set)) rt.input.set(name, value);
      next += 1;
    }
    rt.step();
  }
  return rt;
}

export async function runCommand(opts: {
  dir?: string;
  headless?: boolean;
  ticks?: string;
  seed?: string;
  scene?: string;
  input?: string;
  inputScript?: string;
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
  const eventCounts = Object.fromEntries(rt.eventTotals);
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
      soundCounts: Object.fromEntries(
        [...new Set(rt.sounds.map((s) => s.asset))].map((a) => [a, rt.sounds.filter((s) => s.asset === a).length]),
      ),
      scenes: rt.sceneHistory,
      saves: Object.fromEntries(rt.saves),
      events: rt.events.slice(0, 200),
      logs: rt.logs.slice(0, 200),
      snapshot,
    },
    lines: [
      `simulated ${rt.tick} ticks (${rt.elapsed.toFixed(2)}s) of scene "${rt.sceneId}" with seed ${rt.random.seed}`,
      `events: ${Object.entries(eventCounts).map(([n, c]) => `${n}×${c}`).join(", ") || "none"}`,
      ...(rt.sceneHistory.length > 1 ? [`scenes: ${rt.sceneHistory.map((s) => `${s.scene}@${s.tick}`).join(" → ")}`] : []),
      ...(rt.sounds.length > 0 ? [`sounds played: ${rt.sounds.length}`] : []),
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
  inputScript?: string;
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
      const bytes = await (await ioFor(p.root)).readBytes(asset.path);
      if (bytes !== undefined) images.set(id, svgImage(new Uint8Array(bytes), asset.path, asset.pixelated));
    } catch {
      // Drawn as a magenta placeholder; `moonstage validate` reports the missing file.
    }
  }
  const svg = renderSvg(frame, images, (item) => rt.plugin(item.plugin)?.drawSvg?.(item));
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
