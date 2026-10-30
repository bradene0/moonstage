/**
 * Compact, stable JSON formatting for project files. Like JSON.stringify with
 * an indent, except any array or object whose one-line form fits in the line
 * width stays on one line. Scenes become several times shorter, and diffs of
 * semantic edits stay small, without changing what the file means.
 */

const WIDTH = 100;

function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length === 0 ? "{}" : `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

function format(value: unknown, indent: string, prefix: number): string {
  const flat = inline(value);
  if (indent.length + prefix + flat.length <= WIDTH || value === null || typeof value !== "object") return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => inner + format(v, inner, 0)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries
    .map(([k, v]) => {
      const key = `${JSON.stringify(k)}: `;
      return inner + key + format(v, inner, key.length);
    })
    .join(",\n")}\n${indent}}`;
}

/** Format a JSON value for a Moonstage project file (with a trailing newline). */
export function formatJson(value: unknown): string {
  return `${format(value, "", 0)}\n`;
}
