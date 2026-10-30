/**
 * Plugin conformance suite. Runs a plugin through a small synthetic project
 * and reports whether it follows the plugin contract: valid metadata, schemas
 * that accept its own fixture, only declared capabilities used, a clean
 * lifecycle, correct handling of spawned and removed entities, and identical
 * behavior when a scene is loaded twice.
 *
 * Pure and platform-neutral: `moonstage plugin check` runs it from the CLI,
 * and plugin authors can call it from their own tests.
 */

import { diagnostic, MoonstageError, type Diagnostic } from "./diagnostics.js";
import { checkPlugin, definePlugin, type MoonstagePlugin } from "./plugin.js";
import type { ProjectManifest, SceneSource } from "./project.js";
import { Runtime, type LoadedProject, type Snapshot } from "./runtime.js";
import { validateSchema } from "./schema/validate.js";

/** Inputs for the suite. Plugins can export one as `conformance` from their module. */
export interface ConformanceFixture {
  /** Plugin config to use (default {}). Must satisfy configSchema. */
  config?: Record<string, unknown>;
  /** Extension data placed on test entities (default {}). Must satisfy extensionSchema. */
  extension?: Record<string, unknown>;
  /** Ticks to simulate per run (default 30). */
  ticks?: number;
}

export interface ConformanceCheck {
  name: string;
  description: string;
  passed: boolean;
  /** True when the check could not run because an earlier one failed. */
  skipped?: boolean;
  diagnostics: Diagnostic[];
}

export interface ConformanceReport {
  plugin: string;
  passed: boolean;
  checks: ConformanceCheck[];
}

const HARNESS = "moonstage-conformance-harness";

function fail(message: string, hint?: string): Diagnostic {
  return diagnostic("MS4006", message, hint === undefined ? {} : { hint });
}

function asDiagnostics(err: unknown, context: string): Diagnostic[] {
  if (err instanceof MoonstageError) return err.diagnostics;
  return [fail(`${context}: ${err instanceof Error ? err.message : String(err)}`)];
}

/**
 * Spawns a probe entity carrying the plugin's extension at tick 2 and removes
 * it at tick 4, so entityAdded/entityRemoved and stale ids get exercised.
 */
const harness = definePlugin({
  name: HARNESS,
  version: "0.0.0",
  pluginApi: 2,
  capabilities: ["world.write"],
  create(ctx) {
    let probe: string | undefined;
    return {
      update() {
        if (ctx.time.tick === 2) probe = ctx.world.spawn("probe");
        if (ctx.time.tick === 4 && probe !== undefined) ctx.world.remove(probe);
      },
    };
  },
});

function fixtureProject(plugin: MoonstagePlugin, fixture: ConformanceFixture): LoadedProject {
  const extension = { [plugin.name]: fixture.extension ?? {} };
  const manifest: ProjectManifest = {
    format: 1,
    name: "plugin-conformance",
    entryScene: "main",
    scenes: { main: "main.scene.json" },
    prefabs: { probe: { components: { transform: { position: [5, 5] } }, extensions: extension } },
    plugins: {
      [HARNESS]: { module: HARNESS },
      [plugin.name]: { module: plugin.name, config: fixture.config ?? {} },
    },
  };
  const scene: SceneSource = {
    format: 1,
    entities: [
      { id: "with-extension", components: { transform: { position: [10, 20] } }, extensions: extension },
      { id: "child", parent: "with-extension", extensions: extension },
      { id: "plain", components: { transform: { position: [30, 40] } } },
    ],
  };
  return { manifest, scenes: { main: scene }, behaviors: {}, plugins: { [HARNESS]: harness, [plugin.name]: plugin } };
}

/** One complete lifecycle: create, start, step, stop, dispose. Returns the final snapshot. */
async function run(project: LoadedProject, ticks: number): Promise<Snapshot> {
  const rt = await Runtime.create(project);
  rt.start();
  for (let i = 0; i < ticks; i++) rt.step();
  const snapshot = rt.snapshot();
  rt.stop();
  rt.dispose();
  return snapshot;
}

export async function checkPluginConformance(value: unknown, fixture: ConformanceFixture = {}): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];
  const add = (name: string, description: string, diagnostics: Diagnostic[], skipped = false) => {
    checks.push({ name, description, passed: !skipped && diagnostics.every((d) => d.severity !== "error"), diagnostics, ...(skipped && { skipped }) });
  };
  const plugin = value as MoonstagePlugin;
  const name = typeof plugin?.name === "string" ? plugin.name : "(unnamed)";

  add("definition", "Metadata, plugin API level and capabilities are valid.", typeof plugin?.name === "string" ? checkPlugin(plugin, plugin.name) : checkPlugin(value, name));
  if (!checks[0]!.passed) {
    return { plugin: name, passed: false, checks };
  }

  const schemaIssues: Diagnostic[] = [];
  for (const [label, schema, data] of [
    ["config", plugin.configSchema, fixture.config ?? {}],
    ["extension", plugin.extensionSchema, fixture.extension ?? {}],
  ] as const) {
    if (schema === undefined) continue;
    if (typeof schema !== "object" || schema === null) {
      schemaIssues.push(fail(`${label}Schema must be a JSON Schema object`));
      continue;
    }
    for (const issue of validateSchema(schema, data)) {
      schemaIssues.push(
        fail(`fixture ${label} does not satisfy ${label}Schema: ${issue.path}: ${issue.message}`, "Export a `conformance` fixture with valid sample data."),
      );
    }
  }
  add("schemas", "configSchema and extensionSchema accept the fixture's sample data.", schemaIssues);
  const ticks = fixture.ticks ?? 30;
  const project = fixtureProject(plugin, fixture);

  let first: Snapshot | undefined;
  let lifecycle: Diagnostic[] = [];
  if (schemaIssues.length === 0) {
    try {
      first = await run(project, ticks);
    } catch (err) {
      lifecycle = asDiagnostics(err, "lifecycle");
    }
  }
  const capabilityIssues = lifecycle.filter((d) => d.code === "MS4003");
  add(
    "capabilities",
    "Only declared capabilities are used.",
    capabilityIssues,
    schemaIssues.length > 0,
  );
  add(
    "lifecycle",
    `create, start, update (${ticks} ticks, with an entity spawned and removed), stop and dispose run without errors.`,
    lifecycle.filter((d) => d.code !== "MS4003"),
    schemaIssues.length > 0 || capabilityIssues.length > 0,
  );

  let reload: Diagnostic[] = [];
  const blocked = first === undefined;
  if (!blocked) {
    try {
      const second = await run(fixtureProject(plugin, fixture), ticks);
      if (JSON.stringify(second) !== JSON.stringify(first)) {
        reload.push(
          fail(
            "a second load of the same scene produced different state",
            "Keep all state inside create() (module-level variables survive between runtimes) and use ctx.random() instead of Math.random().",
          ),
        );
      }
    } catch (err) {
      reload = asDiagnostics(err, "second load");
    }
  }
  add("reload", "Loading the scene a second time works and produces identical state.", reload, blocked);

  return { plugin: name, passed: checks.every((c) => c.passed), checks };
}
