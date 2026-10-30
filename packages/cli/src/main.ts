#!/usr/bin/env node
/** Entry point for the `moonstage` command. */

import { parseArgs, type ParseArgsConfig } from "node:util";
import { diagnostic, MoonstageError } from "@moonstage/core";
import * as commands from "./commands.js";
import { readFileSync } from "node:fs";
import { serveMcp } from "./mcp.js";
import { EXIT, print, result, type CommandResult } from "./output.js";

const shared = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const satisfies ParseArgsConfig["options"];

const sim = {
  ticks: { type: "string" },
  tick: { type: "string" },
  seed: { type: "string" },
  scene: { type: "string" },
  input: { type: "string" },
  "input-script": { type: "string" },
  "no-build": { type: "boolean" },
} as const satisfies ParseArgsConfig["options"];

const OPTIONS: Record<string, ParseArgsConfig["options"]> = {
  describe: shared,
  new: { ...shared, name: { type: "string" }, template: { type: "string" } },
  validate: shared,
  inspect: shared,
  build: { ...shared, out: { type: "string" }, "no-bundle": { type: "boolean" }, "single-file": { type: "boolean" } },
  run: { ...shared, ...sim, headless: { type: "boolean" }, port: { type: "string" } },
  test: { ...shared, filter: { type: "string" }, "no-build": { type: "boolean" } },
  render: { ...shared, ...sim, output: { type: "string", short: "o" } },
  schemas: { ...shared, write: { type: "boolean" }, out: { type: "string" } },
  plugin: { ...shared, name: { type: "string" } },
  scene: { ...shared, scene: { type: "string" } },
  edit: { ...shared, scene: { type: "string" }, op: { type: "string" }, ops: { type: "string" }, "dry-run": { type: "boolean" } },
  mcp: shared,
  guide: shared,
  fmt: { ...shared, check: { type: "boolean" } },
  pack: { ...shared, out: { type: "string" } },
  unpack: shared,
};

/** Operations from --op (inline JSON) or --ops (file path, or "-" for stdin). */
async function readOperations(values: Record<string, unknown>): Promise<unknown> {
  const source =
    typeof values.op === "string"
      ? values.op
      : values.ops === "-"
        ? await new Promise<string>((done) => {
            let text = "";
            process.stdin.on("data", (b: Buffer) => (text += b.toString())).on("end", () => done(text));
          })
        : typeof values.ops === "string"
          ? readFileSync(values.ops, "utf8")
          : undefined;
  if (source === undefined) return undefined;
  try {
    return JSON.parse(source);
  } catch (err) {
    throw new MoonstageError([diagnostic("MS9001", `operations are not valid JSON: ${(err as Error).message}`)]);
  }
}

function help(): CommandResult {
  return result({
    lines: [
      `moonstage ${commands.CLI_VERSION} — lightweight, browser-first interactive runtime (early development)`,
      "",
      "Usage:",
      ...commands.COMMANDS.map((c) => `  ${c.usage}`),
      "",
      "Every command accepts --json for machine-readable output.",
      "Exit codes: 0 ok, 1 project errors or failed tests, 2 usage error, 3 missing toolchain, 4 internal error.",
    ],
  });
}

async function dispatch(name: string, values: Record<string, unknown>, dir: string | undefined, rest: string[]) {
  const s = (k: string) => values[k] as string | undefined;
  const build = !values["no-build"];
  switch (name) {
    case "describe":
      return commands.describe();
    case "new":
      return commands.create({ dir, ...(s("name") && { name: s("name") }), ...(s("template") && { template: s("template") }) });
    case "validate":
      return commands.validate({ dir });
    case "inspect":
      return commands.inspect({ dir });
    case "build":
      return commands.build({ dir, ...(s("out") && { out: s("out") }), bundle: !values["no-bundle"], singleFile: Boolean(values["single-file"]) });
    case "run":
      return commands.runCommand({
        dir,
        headless: Boolean(values.headless),
        ticks: s("ticks"),
        seed: s("seed"),
        scene: s("scene"),
        input: s("input"),
        inputScript: s("input-script"),
        port: s("port"),
        build,
      });
    case "test":
      return commands.test({ dir, filter: s("filter"), build });
    case "render":
      return commands.render({
        dir,
        tick: s("tick") ?? s("ticks"),
        scene: s("scene"),
        seed: s("seed"),
        output: s("output"),
        input: s("input"),
        inputScript: s("input-script"),
        build,
      });
    case "schemas":
      return commands.schemas({ write: Boolean(values.write), ...(s("out") && { out: s("out") }) });
    case "scene":
      return commands.getScene({ dir, ...(s("scene") && { scene: s("scene") }) });
    case "edit":
      return commands.editScene({
        dir,
        ...(s("scene") && { scene: s("scene") }),
        operations: await readOperations(values),
        dryRun: Boolean(values["dry-run"]),
      });
    case "pack":
      return commands.pack({ dir, ...(s("out") && { out: s("out") }) });
    case "unpack":
      return commands.unpack({ file: dir, ...(rest[0] !== undefined && { dir: rest[0] }) });
    case "fmt":
      return commands.fmt({ dir, check: Boolean(values.check) });
    case "guide":
      return commands.guide({ ...(dir !== undefined && { topic: dir }) });
    case "mcp":
      await serveMcp();
      return result({});
    case "plugin":
      // `dir` is the subcommand here; the path follows it.
      if (dir === "new") return commands.pluginNew({ dir: rest[0], ...(s("name") && { name: s("name") }) });
      if (dir === "check") return commands.pluginCheck({ path: rest[0] });
      return result({
        exitCode: EXIT.usage,
        diagnostics: [diagnostic("MS9001", `unknown plugin subcommand "${dir ?? ""}": use "plugin new" or "plugin check"`)],
      });
  }
  throw new Error(`unreachable: ${name}`);
}

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const wantsJson = rest.includes("--json");
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    print("help", help(), wantsJson);
    return EXIT.ok;
  }
  if (name === "--version" || name === "-v") {
    process.stdout.write(`${commands.CLI_VERSION}\n`);
    return EXIT.ok;
  }
  const options = OPTIONS[name];
  if (options === undefined) {
    print(name, result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", `unknown command "${name}"`)] }), wantsJson);
    return EXIT.usage;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options, allowPositionals: true, strict: true });
  } catch (err) {
    print(name, result({ exitCode: EXIT.usage, diagnostics: [diagnostic("MS9001", (err as Error).message)] }), wantsJson);
    return EXIT.usage;
  }
  const json = Boolean(parsed.values.json);
  if (parsed.values.help) {
    const spec = commands.COMMANDS.find((c) => c.name === name)!;
    print(name, result({ lines: [spec.summary, "", `Usage: ${spec.usage}`], data: { ...spec } }), json);
    return EXIT.ok;
  }
  try {
    const r = await dispatch(name, parsed.values, parsed.positionals[0], parsed.positionals.slice(1));
    print(name, r, json);
    // `run` without --headless keeps a server alive; let it hold the process open.
    if ("server" in r && r.server) return -1;
    return r.exitCode;
  } catch (err) {
    const r =
      err instanceof MoonstageError
        ? result({ exitCode: err.diagnostics.some((d) => d.code === "MS9001") ? EXIT.usage : EXIT.failure, diagnostics: err.diagnostics })
        : result({ exitCode: EXIT.internal, diagnostics: [diagnostic("MS9003", err instanceof Error ? (err.stack ?? err.message) : String(err))] });
    print(name, r, json);
    return r.exitCode;
  }
}

const code = await main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
