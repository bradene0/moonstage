/**
 * Structured diagnostics. Every problem Moonstage reports carries a stable
 * code so humans and agents can act on it without parsing prose.
 */

export type Severity = "error" | "warning";

export interface Diagnostic {
  /** Stable identifier, e.g. "MS2001". Never reused for a different meaning. */
  code: string;
  severity: Severity;
  /** Human-readable explanation. */
  message: string;
  /** Project-relative file the problem is in, when known. */
  file?: string;
  /** Location inside the file, e.g. "entities[2].components.transform". */
  path?: string;
  /** Stable entity id, when the problem concerns an entity. */
  entity?: string;
  /** Component name, when the problem concerns a component. */
  component?: string;
  /** Actionable remediation, when one is known. */
  hint?: string;
}

export interface DiagnosticCodeInfo {
  title: string;
  hint?: string;
}

/**
 * Catalog of every diagnostic code. Exposed through `moonstage describe` so
 * agents can look codes up. Ranges:
 * MS1xxx source/schema, MS2xxx project semantics, MS3xxx behaviors,
 * MS4xxx plugins, MS5xxx tests and operations, MS9xxx CLI/environment.
 */
export const DIAGNOSTIC_CODES = {
  MS1001: { title: "Schema violation", hint: "Compare the file against the JSON schema printed by `moonstage describe --json`." },
  MS1002: { title: "Invalid JSON", hint: "Fix the JSON syntax error at the reported location." },
  MS1003: { title: "File not found", hint: "Create the file or fix the path that references it." },
  MS1004: { title: "Unsupported format version", hint: "Set `format` to a version this Moonstage understands (see `moonstage describe`)." },
  MS2001: { title: "Duplicate entity id", hint: "Entity ids must be unique within a scene." },
  MS2002: { title: "Unknown parent entity", hint: "Set `parent` to the id of an entity in the same scene, or remove it." },
  MS2003: { title: "Parent cycle", hint: "An entity cannot be its own ancestor." },
  MS2004: { title: "Unknown scene", hint: "Declare the scene under `scenes` in moonstage.json." },
  MS2005: { title: "Unknown behavior module", hint: "Declare the module under `behaviors` in moonstage.json." },
  MS2006: { title: "Behavior parameter mismatch", hint: "Entity params must match the names declared in the behavior's `params` list." },
  MS2007: { title: "Behavior reference mismatch", hint: "Refs must use names declared in the behavior's `refs` list and point to existing entities." },
  MS2008: { title: "Behavior state mismatch", hint: "Initial state must use names declared in the behavior's `state` list." },
  MS2009: { title: "Unknown input", hint: "Declare the input under `input.axes` or `input.buttons` in moonstage.json." },
  MS2010: { title: "Invalid camera", hint: "The scene `camera` must name an entity that has a `camera` component." },
  MS2011: { title: "Extension without plugin", hint: "Add the plugin to `plugins` in moonstage.json, or remove the extension data." },
  MS2012: { title: "Unknown state binding", hint: "Text placeholders use {entityId.stateName}; frameState names a state of the entity's behaviors." },
  MS2013: { title: "Slot name collision", hint: "Behavior names must stay distinct after conversion to snake_case; rename one." },
  MS2014: { title: "Unknown prefab", hint: "Declare the prefab under `prefabs` in moonstage.json." },
  MS2015: { title: "Invalid sprite asset", hint: "Declare the image under `assets` in moonstage.json and check frame indices." },
  MS2016: { title: "Invalid physics setup", hint: "Joints must target another entity; physics components need a plugin that provides \"physics\"." },
  MS2017: { title: "Invalid sound", hint: "Declare the sound under `assets` with an audio file (.ogg, .mp3, .wav, ...) or type \"audio\"." },
  MS3001: { title: "Behavior not built", hint: "Run `moonstage build` to compile behaviors." },
  MS3002: { title: "Behavior ABI mismatch", hint: "Rebuild the behavior against a compatible Moonstage SDK." },
  MS3003: { title: "Behavior export missing", hint: "Behaviors must export ms_abi_version, ms_start, ms_update and ms_event." },
  MS3004: { title: "Behavior trapped", hint: "A behavior raised a WebAssembly trap; inspect the entity and module named in the diagnostic." },
  MS3005: { title: "MoonBit toolchain not found", hint: "Install MoonBit (https://www.moonbitlang.com/download) or set MOONSTAGE_MOON to the `moon` binary." },
  MS3006: { title: "Behavior compile failed", hint: "Fix the compiler errors reported for the behavior source." },
  MS3007: { title: "Invalid behavior module", hint: "The file is not a valid WebAssembly module." },
  MS3008: { title: "Generated slots out of date", hint: "Run `moonstage build` (or run/test/render) to regenerate slots.generated.mbt." },
  MS4001: { title: "Plugin load failed", hint: "Check the plugin `module` path and that it default-exports a plugin." },
  MS4002: { title: "Plugin API incompatible", hint: "Use a plugin version that targets this runtime's plugin API level." },
  MS4003: { title: "Plugin capability not granted", hint: "Declare the capability in the plugin's `capabilities` list." },
  MS4004: { title: "Plugin configuration invalid", hint: "Fix the plugin config or entity extension data to match the plugin's schema." },
  MS4005: { title: "Invalid plugin definition", hint: "A plugin needs name, version, pluginApi, capabilities and create()." },
  MS4006: { title: "Plugin conformance check failed", hint: "Run `moonstage plugin check <path> --json` for the failing check." },
  MS5001: { title: "Test assertion failed" },
  MS5002: { title: "Invalid test file", hint: "Compare the test against the test schema printed by `moonstage describe --json`." },
  MS5003: { title: "Invalid operation", hint: "Check the operation target and property path." },
  MS9001: { title: "Usage error", hint: "Run `moonstage help` for usage." },
  MS9002: { title: "Not a Moonstage project", hint: "Run the command in a directory containing moonstage.json, or pass the project path." },
  MS9003: { title: "Internal error", hint: "This is a Moonstage bug; please report it with the command you ran." },
} as const satisfies Record<string, DiagnosticCodeInfo>;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;

/** Build a diagnostic. Severity defaults to "error"; hint defaults to the catalog hint. */
export function diagnostic(
  code: DiagnosticCode,
  message: string,
  extra: Partial<Omit<Diagnostic, "code" | "message">> = {},
): Diagnostic {
  const info: DiagnosticCodeInfo = DIAGNOSTIC_CODES[code];
  const d: Diagnostic = { code, severity: extra.severity ?? "error", message };
  if (extra.file !== undefined) d.file = extra.file;
  if (extra.path !== undefined) d.path = extra.path;
  if (extra.entity !== undefined) d.entity = extra.entity;
  if (extra.component !== undefined) d.component = extra.component;
  const hint = extra.hint ?? info.hint;
  if (hint !== undefined) d.hint = hint;
  return d;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** Thrown when an operation cannot continue; carries structured diagnostics. */
export class MoonstageError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    this.name = "MoonstageError";
    this.diagnostics = diagnostics;
  }
}
