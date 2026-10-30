/**
 * A small validator for the subset of JSON Schema (draft 2020-12) that
 * Moonstage's own schemas use. Keeping it in core means validation works in
 * the browser and in Node with zero dependencies. The published schemas are
 * still standard JSON Schema, so external tools can use any validator.
 *
 * Supported keywords: type, enum, const, properties, required,
 * additionalProperties, items, prefixItems, minItems, maxItems, minimum,
 * maximum, exclusiveMinimum, minLength, pattern, anyOf, $ref (local "#/$defs/..").
 * Annotation keywords ($schema, $id, title, description, default, examples) are ignored.
 */

export type JsonSchema = {
  [keyword: string]: unknown;
};

export interface SchemaIssue {
  /** Location in the instance, e.g. "entities[0].components.transform.position". */
  path: string;
  message: string;
}

export function validateSchema(schema: JsonSchema, value: unknown, root: JsonSchema = schema): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  check(schema, value, "", root, issues);
  return issues;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(expected: string, actual: string): boolean {
  return expected === actual || (expected === "number" && actual === "integer");
}

function join(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  return path === "" ? key : `${path}.${key}`;
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref "${ref}"`);
  let node: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (node === undefined) throw new Error(`Unresolvable $ref "${ref}"`);
  return node as JsonSchema;
}

function check(schema: JsonSchema, value: unknown, path: string, root: JsonSchema, issues: SchemaIssue[]): void {
  const here = path === "" ? "(root)" : path;

  if (typeof schema.$ref === "string") {
    check(resolveRef(schema.$ref, root), value, path, root, issues);
  }

  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as JsonSchema[];
    const results = branches.map((branch) => {
      const branchIssues: SchemaIssue[] = [];
      check(branch, value, path, root, branchIssues);
      return branchIssues;
    });
    if (!results.some((r) => r.length === 0)) {
      // When exactly one branch accepts the value's type, its issues are the useful ones.
      const typed = results.filter((r) => !r.some((i) => i.path === here && i.message.startsWith("expected ")));
      if (typed.length === 1) issues.push(...typed[0]!);
      else issues.push({ path: here, message: describeAnyOf(branches, root) });
    }
  }

  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => matchesType(t, actual))) {
      issues.push({ path: here, message: `expected ${types.join(" or ")}, got ${actual}` });
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path: here, message: `must be ${JSON.stringify(schema.const)}` });
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    issues.push({ path: here, message: `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}` });
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push({ path: here, message: `must be >= ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push({ path: here, message: `must be <= ${schema.maximum}` });
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      issues.push({ path: here, message: `must be > ${schema.exclusiveMinimum}` });
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      issues.push({ path: here, message: `must have at least ${schema.minLength} characters` });
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      issues.push({ path: here, message: `must match pattern ${schema.pattern}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push({ path: here, message: `must have at least ${schema.minItems} items` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push({ path: here, message: `must have at most ${schema.maxItems} items` });
    }
    const prefix = Array.isArray(schema.prefixItems) ? (schema.prefixItems as JsonSchema[]) : [];
    value.forEach((item, i) => {
      const itemSchema = i < prefix.length ? prefix[i] : (schema.items as JsonSchema | undefined);
      if (itemSchema !== undefined) check(itemSchema, item, join(path, i), root, issues);
    });
  }

  if (actual === "object") {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) issues.push({ path: here, message: `missing required property "${key}"` });
      }
    }
    for (const [key, child] of Object.entries(obj)) {
      const propSchema = props[key];
      if (propSchema !== undefined) {
        check(propSchema, child, join(path, key), root, issues);
      } else if (schema.additionalProperties === false) {
        issues.push({ path: join(path, key), message: `unknown property "${key}"` });
      } else if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
        check(schema.additionalProperties as JsonSchema, child, join(path, key), root, issues);
      }
    }
  }
}

function describeAnyOf(branches: JsonSchema[], root: JsonSchema): string {
  const names = branches.map((b) => {
    const s = typeof b.$ref === "string" ? resolveRef(b.$ref, root) : b;
    return (s.title as string | undefined) ?? (s.type as string | undefined) ?? "schema";
  });
  return `must match one of: ${names.join(", ")}`;
}
