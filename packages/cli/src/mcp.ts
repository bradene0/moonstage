/**
 * `moonstage mcp`: a Model Context Protocol server over stdio.
 *
 * A thin adapter: every tool calls the same command function the CLI uses
 * and returns its structured result as JSON text. There is no second
 * architecture for agents. Messages are newline-delimited JSON-RPC 2.0;
 * stdout carries protocol messages only.
 */

import { createInterface } from "node:readline";
import * as commands from "./commands.js";
import type { CommandResult } from "./output.js";

type Args = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run(args: Args): Promise<CommandResult & { svg?: string }> | (CommandResult & { svg?: string });
}

const dir = { type: "string", description: "Project directory (contains moonstage.json)." };
const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", minimum: 0, description });
const s = (v: unknown) => (typeof v === "string" ? v : undefined);
const n = (v: unknown) => (typeof v === "number" ? String(v) : undefined);

export const TOOLS: Tool[] = [
  {
    name: "moonstage_describe",
    description: "Moonstage versions, components, behavior ABI, plugin capabilities, exit codes and diagnostic codes.",
    inputSchema: { type: "object", properties: {} },
    run: () => commands.describe(),
  },
  {
    name: "moonstage_new_project",
    description: "Create a new project from the minimal template in an empty directory.",
    inputSchema: { type: "object", properties: { dir, name: str("Display name.") }, required: ["dir"] },
    run: (a) => commands.create({ dir: s(a.dir), ...(s(a.name) && { name: s(a.name) }) }),
  },
  {
    name: "moonstage_validate",
    description: "Validate project files, references, plugins, assets and tests. Returns diagnostics with codes and locations.",
    inputSchema: { type: "object", properties: { dir }, required: ["dir"] },
    run: (a) => commands.validate({ dir: s(a.dir) }),
  },
  {
    name: "moonstage_inspect",
    description: "Structured summary of scenes, entities, behaviors, prefabs, plugins and tests.",
    inputSchema: { type: "object", properties: { dir }, required: ["dir"] },
    run: (a) => commands.inspect({ dir: s(a.dir) }),
  },
  {
    name: "moonstage_get_scene",
    description: "Source JSON of one scene (default: the entry scene).",
    inputSchema: { type: "object", properties: { dir, scene: str("Scene id.") }, required: ["dir"] },
    run: (a) => commands.getScene({ dir: s(a.dir), ...(s(a.scene) && { scene: s(a.scene) }) }),
  },
  {
    name: "moonstage_edit_scene",
    description:
      "Apply semantic operations (set_property, unset_property, add_entity, remove_entity, attach_behavior, detach_behavior) to a scene. " +
      "The whole project is validated first; nothing is written if there are errors. See the operation schema from moonstage_describe.",
    inputSchema: {
      type: "object",
      properties: {
        dir,
        scene: str("Scene id (default: entry scene)."),
        operations: { type: "array", items: { type: "object" }, description: "Operations, applied in order." },
        dryRun: { type: "boolean", description: "Validate without writing." },
      },
      required: ["dir", "operations"],
    },
    run: (a) =>
      commands.editScene({ dir: s(a.dir), ...(s(a.scene) && { scene: s(a.scene) }), operations: a.operations, dryRun: a.dryRun === true }),
  },
  {
    name: "moonstage_build",
    description: "Compile MoonBit behaviors and write the static web bundle.",
    inputSchema: { type: "object", properties: { dir }, required: ["dir"] },
    run: (a) => commands.build({ dir: s(a.dir) }),
  },
  {
    name: "moonstage_test",
    description: "Compile behaviors and run tests/*.test.json headlessly.",
    inputSchema: { type: "object", properties: { dir, filter: str("Only tests whose file or name contains this.") }, required: ["dir"] },
    run: (a) => commands.test({ dir: s(a.dir), filter: s(a.filter) }),
  },
  {
    name: "moonstage_run_headless",
    description: "Simulate ticks without rendering; returns event counts, logs, diagnostics and a full state snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        dir,
        ticks: int("Ticks to simulate (default 600)."),
        seed: int("Random seed."),
        scene: str("Scene id."),
        input: { type: "object", additionalProperties: { type: "number" }, description: "Inputs held for the whole run." },
      },
      required: ["dir"],
    },
    run: (a) =>
      commands.runCommand({
        dir: s(a.dir),
        headless: true,
        ticks: n(a.ticks),
        seed: n(a.seed),
        scene: s(a.scene),
        input: a.input === undefined ? undefined : JSON.stringify(a.input),
      }),
  },
  {
    name: "moonstage_render",
    description: "Simulate to a tick and render that frame as SVG (written to a file; optionally returned inline).",
    inputSchema: {
      type: "object",
      properties: {
        dir,
        tick: int("Tick to render (default 0)."),
        scene: str("Scene id."),
        seed: int("Random seed."),
        output: str("SVG file path (default .moonstage/render/<scene>-<tick>.svg)."),
        includeSvg: { type: "boolean", description: "Also return the SVG text." },
      },
      required: ["dir"],
    },
    run: async (a) => {
      const r = await commands.render({ dir: s(a.dir), tick: n(a.tick), scene: s(a.scene), seed: n(a.seed), output: s(a.output) });
      return a.includeSvg === true ? r : { ...r, svg: undefined };
    },
  },
  {
    name: "moonstage_plugin_check",
    description: "Run the plugin conformance suite on a plugin module file or package directory.",
    inputSchema: { type: "object", properties: { path: str("Plugin module or package directory.") }, required: ["path"] },
    run: (a) => commands.pluginCheck({ path: s(a.path) }),
  },
  {
    name: "moonstage_schemas",
    description: "JSON Schemas for project, scene, operation and test files.",
    inputSchema: { type: "object", properties: {} },
    run: () => commands.schemas({}),
  },
];

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface Request {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/** Handle one JSON-RPC message; returns the response, or undefined for notifications. */
export async function handleMessage(message: Request): Promise<object | undefined> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: message.id ?? null, result });
  const error = (code: number, text: string) => ({ jsonrpc: "2.0", id: message.id ?? null, error: { code, message: text } });
  if (message.id === undefined) return undefined; // notifications (e.g. notifications/initialized)

  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "moonstage", version: commands.CLI_VERSION },
        instructions:
          "Moonstage projects are folders of JSON plus MoonBit behaviors. Start with moonstage_describe, then " +
          "moonstage_inspect. Prefer moonstage_edit_scene over rewriting scene files. Verify with moonstage_validate, moonstage_test and moonstage_render.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === message.params?.name);
      if (tool === undefined) return error(-32602, `unknown tool "${String(message.params?.name)}"`);
      try {
        const r = await tool.run((message.params?.arguments ?? {}) as Args);
        const payload = { ok: r.ok, exitCode: r.exitCode, ...r.data, diagnostics: r.diagnostics };
        const content: { type: "text"; text: string }[] = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
        if (r.svg !== undefined) content.push({ type: "text", text: r.svg });
        return reply({ content, isError: !r.ok });
      } catch (err) {
        return reply({ content: [{ type: "text", text: `internal error: ${err instanceof Error ? err.message : String(err)}` }], isError: true });
      }
    }
    default:
      return error(-32601, `method not found: ${message.method}`);
  }
}

/** Serve until stdin closes. Requests are handled one at a time, in order. */
export async function serveMcp(): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    let message: Request;
    try {
      message = JSON.parse(line) as Request;
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })}\n`);
      continue;
    }
    const response = await handleMessage(message);
    if (response !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
