/**
 * Command results and output. Every command returns a CommandResult; the
 * entry point prints it as JSON (--json) or as human-readable text. Agents
 * should always use --json and the exit code; never parse the text form.
 */

import type { Diagnostic } from "@moonstage/core";

/** Process exit codes. Stable contract. */
export const EXIT = {
  ok: 0,
  /** The project has errors, or tests failed. */
  failure: 1,
  /** The command line was invalid. */
  usage: 2,
  /** A required tool (e.g. MoonBit) is missing or failed to run. */
  environment: 3,
  /** Moonstage itself failed unexpectedly. */
  internal: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export interface CommandResult {
  ok: boolean;
  exitCode: ExitCode;
  /** Command-specific payload, merged into the JSON output. */
  data: Record<string, unknown>;
  diagnostics: Diagnostic[];
  /** Human-readable summary lines (ignored in --json mode). */
  lines: string[];
}

export function result(
  partial: Partial<CommandResult> & { data?: Record<string, unknown> },
): CommandResult {
  const diagnostics = partial.diagnostics ?? [];
  const failed = diagnostics.some((d) => d.severity === "error");
  const ok = partial.ok ?? !failed;
  return {
    ok,
    exitCode: partial.exitCode ?? (ok ? EXIT.ok : EXIT.failure),
    data: partial.data ?? {},
    diagnostics,
    lines: partial.lines ?? [],
  };
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = [d.file, d.path].filter(Boolean).join(" ");
  const subject = d.entity ? ` [${d.entity}${d.component ? `.${d.component}` : ""}]` : "";
  const head = `${d.severity} ${d.code}${where ? ` ${where}` : ""}${subject}: ${d.message}`;
  return d.hint ? `${head}\n  hint: ${d.hint}` : head;
}

export function print(command: string, r: CommandResult, json: boolean): void {
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: r.ok, command, exitCode: r.exitCode, ...r.data, diagnostics: r.diagnostics }, null, 2)}\n`,
    );
    return;
  }
  for (const line of r.lines) process.stdout.write(`${line}\n`);
  for (const d of r.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
}
