/**
 * Headless test runner for project tests (tests/*.test.json). Runs a scene
 * for a fixed number of ticks with scripted input, then checks assertions
 * against runtime state and recorded events. No rendering involved.
 */

import { diagnostic, MoonstageError, type Diagnostic } from "./diagnostics.js";
import { applyOperations } from "./operations.js";
import type { Assertion, Comparison, TestSource } from "./project.js";
import { Runtime, type LoadedProject, type Snapshot } from "./runtime.js";

export interface TestResult {
  name: string;
  file?: string;
  passed: boolean;
  ticks: number;
  /** Assertion failures and runtime problems (traps). */
  diagnostics: Diagnostic[];
  events: number;
  snapshot?: Snapshot;
}

function compare(actual: number | boolean, c: Comparison): string[] {
  const failures: string[] = [];
  if (c.equals !== undefined && actual !== c.equals) failures.push(`expected ${c.equals}, got ${actual}`);
  if (typeof actual === "number") {
    if (c.approx !== undefined && Math.abs(actual - c.approx) > (c.tolerance ?? 1e-6)) {
      failures.push(`expected ~${c.approx} (±${c.tolerance ?? 1e-6}), got ${actual}`);
    }
    if (c.gt !== undefined && !(actual > c.gt)) failures.push(`expected > ${c.gt}, got ${actual}`);
    if (c.gte !== undefined && !(actual >= c.gte)) failures.push(`expected >= ${c.gte}, got ${actual}`);
    if (c.lt !== undefined && !(actual < c.lt)) failures.push(`expected < ${c.lt}, got ${actual}`);
    if (c.lte !== undefined && !(actual <= c.lte)) failures.push(`expected <= ${c.lte}, got ${actual}`);
  } else if (c.gt !== undefined || c.gte !== undefined || c.lt !== undefined || c.lte !== undefined || c.approx !== undefined) {
    failures.push(`expected a number, got ${actual}`);
  }
  return failures;
}

export function checkAssertion(rt: Runtime, a: Assertion, index: number, file?: string): Diagnostic[] {
  const path = `expect[${index}]`;
  const fail = (message: string, entity?: string) =>
    diagnostic("MS5001", message, { file, path, ...(entity !== undefined && { entity }) });

  if ("event" in a) {
    const count = rt.events.filter((e) => e.name === a.event).length;
    return compare(count, a.count ?? { gte: 1 }).map((m) => fail(`event "${a.event}" count: ${m}`));
  }
  if ("scene" in a) {
    return rt.sceneId === a.scene ? [] : [fail(`expected scene "${a.scene}", current scene is "${rt.sceneId}"`)];
  }
  if ("sound" in a) {
    const count = rt.sounds.filter((s) => s.asset === a.sound).length;
    return compare(count, a.count ?? { gte: 1 }).map((m) => fail(`sound "${a.sound}" plays: ${m}`));
  }
  if ("prefab" in a) {
    const count = rt.countSpawned(a.prefab);
    return compare(count, a.count ?? { gte: 1 }).map((m) => fail(`live "${a.prefab}" entities: ${m}`));
  }
  if ("exists" in a) {
    const exists = rt.world.handle(a.target) >= 0;
    return exists === a.exists ? [] : [fail(`expected "${a.target}" to ${a.exists ? "exist" : "not exist"}`, a.target)];
  }
  const actual = rt.read(a.target, a.property);
  if (actual === undefined) {
    return [fail(`"${a.target}" has no readable property "${a.property}"`, a.target)];
  }
  return compare(actual, a).map((m) => fail(`${a.target} ${a.property}: ${m}`, a.target));
}

export async function runTest(project: LoadedProject, test: TestSource, file?: string): Promise<TestResult> {
  const sceneId = test.scene ?? project.manifest.entryScene;
  const result: TestResult = { name: test.name, passed: false, ticks: 0, diagnostics: [], events: 0 };
  if (file !== undefined) result.file = file;

  let rt: Runtime;
  try {
    const base = project.scenes[sceneId];
    if (base === undefined) throw new MoonstageError([diagnostic("MS2004", `scene "${sceneId}" is not loaded`, { file })]);
    const sceneSource = applyOperations(base, test.setup ?? []);
    rt = await Runtime.create(project, {
      scene: sceneId,
      sceneSource,
      ...(test.seed !== undefined && { seed: test.seed }),
    });
  } catch (err) {
    result.diagnostics = err instanceof MoonstageError ? err.diagnostics : [diagnostic("MS9003", String(err), { file })];
    return result;
  }

  const changes = [...(test.input ?? [])].sort((a, b) => a.tick - b.tick);
  let next = 0;
  rt.start();
  for (let tick = 0; tick < test.ticks; tick++) {
    while (next < changes.length && changes[next]!.tick <= tick) {
      for (const [name, value] of Object.entries(changes[next]!.set)) rt.input.set(name, value);
      next += 1;
    }
    rt.step();
  }

  result.ticks = rt.tick;
  result.events = rt.events.length;
  result.diagnostics = [...rt.diagnostics, ...test.expect.flatMap((a, i) => checkAssertion(rt, a, i, file))];
  result.passed = result.diagnostics.every((d) => d.severity !== "error");
  result.snapshot = rt.snapshot();
  rt.stop();
  rt.dispose();
  return result;
}
