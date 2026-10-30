/**
 * Semantic scene operations. Tests, the CLI and future editor/MCP surfaces
 * share this one mutation model instead of rewriting whole scene files.
 *
 * Operations are pure: they return a new scene and never mutate their input.
 */

import { diagnostic, MoonstageError } from "./diagnostics.js";
import { behaviorsOf, type BehaviorComponent, type EntitySource, type SceneSource } from "./project.js";

export type Operation =
  | { operation: "set_property"; target: string; property: string; value: unknown }
  | { operation: "add_entity"; entity: EntitySource }
  | { operation: "remove_entity"; target: string }
  | { operation: "unset_property"; target: string; property: string }
  | { operation: "attach_behavior"; target: string; behavior: BehaviorComponent; index?: number }
  | { operation: "detach_behavior"; target: string; module: string };

/** Vector component aliases accepted in property paths. */
const AXIS: Record<string, number> = { x: 0, y: 1 };

/**
 * Split a property path into keys. "transform.position.x" -> ["transform", "position", 0].
 * Entity-level fields (parent, active, name) are addressed directly.
 */
export function parsePropertyPath(property: string): (string | number)[] {
  return property.split(".").map((part) => {
    if (part in AXIS) return AXIS[part]!;
    if (/^\d+$/.test(part)) return Number(part);
    return part;
  });
}

/** Source data is plain JSON, so a JSON round-trip is a faithful deep copy. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

const ENTITY_FIELDS = new Set(["parent", "active", "name"]);

export function applyOperation(scene: SceneSource, op: Operation): SceneSource {
  const next: SceneSource = clone(scene);
  switch (op.operation) {
    case "add_entity": {
      if (next.entities.some((e) => e.id === op.entity.id)) {
        throw new MoonstageError([diagnostic("MS2001", `entity "${op.entity.id}" already exists`, { entity: op.entity.id })]);
      }
      next.entities.push(clone(op.entity));
      return next;
    }
    case "remove_entity": {
      const index = next.entities.findIndex((e) => e.id === op.target);
      if (index < 0) throw missing(op.target);
      next.entities.splice(index, 1);
      // Detach children so the scene stays valid.
      for (const e of next.entities) if (e.parent === op.target) e.parent = null;
      return next;
    }
    case "unset_property": {
      const entity = next.entities.find((e) => e.id === op.target);
      if (entity === undefined) throw missing(op.target);
      const keys = parsePropertyPath(op.property);
      if (keys.length === 1 && ENTITY_FIELDS.has(keys[0] as string)) {
        delete (entity as unknown as Record<string, unknown>)[keys[0] as string];
        return next;
      }
      let node = entity.components as Record<string | number, unknown> | undefined;
      for (const key of keys.slice(0, -1)) node = node?.[key] as Record<string | number, unknown> | undefined;
      const last = keys[keys.length - 1]!;
      if (node === undefined || !(last in node)) {
        throw new MoonstageError([diagnostic("MS5003", `"${op.target}" has no property "${op.property}"`, { entity: op.target })]);
      }
      if (Array.isArray(node)) node.splice(last as number, 1);
      else delete node[last];
      return next;
    }
    case "attach_behavior": {
      const entity = next.entities.find((e) => e.id === op.target);
      if (entity === undefined) throw missing(op.target);
      const list = behaviorsOf(entity.components);
      list.splice(op.index ?? list.length, 0, clone(op.behavior));
      entity.components = { ...entity.components, behavior: list.length === 1 ? list[0]! : list };
      return next;
    }
    case "detach_behavior": {
      const entity = next.entities.find((e) => e.id === op.target);
      if (entity === undefined) throw missing(op.target);
      const list = behaviorsOf(entity.components);
      const index = list.findIndex((b) => b.module === op.module);
      if (index < 0) {
        throw new MoonstageError([diagnostic("MS5003", `"${op.target}" has no "${op.module}" behavior`, { entity: op.target })]);
      }
      list.splice(index, 1);
      const components = { ...entity.components };
      if (list.length === 0) delete components.behavior;
      else components.behavior = list.length === 1 ? list[0]! : list;
      entity.components = components;
      return next;
    }
    case "set_property": {
      const entity = next.entities.find((e) => e.id === op.target);
      if (entity === undefined) throw missing(op.target);
      const keys = parsePropertyPath(op.property);
      if (keys.length === 1 && ENTITY_FIELDS.has(keys[0] as string)) {
        (entity as unknown as Record<string, unknown>)[keys[0] as string] = clone(op.value);
        return next;
      }
      entity.components ??= {};
      let node = entity.components as Record<string | number, unknown>;
      keys.forEach((key, i) => {
        if (i === keys.length - 1) {
          node[key] = clone(op.value);
          return;
        }
        if (node[key] === undefined || node[key] === null) node[key] = typeof keys[i + 1] === "number" ? [0, 0] : {};
        if (typeof node[key] !== "object") {
          throw new MoonstageError([
            diagnostic("MS5003", `cannot set "${op.property}": "${String(key)}" is not an object`, { entity: op.target }),
          ]);
        }
        node = node[key] as Record<string | number, unknown>;
      });
      return next;
    }
  }
}

export function applyOperations(scene: SceneSource, ops: readonly Operation[]): SceneSource {
  return ops.reduce(applyOperation, scene);
}

function missing(target: string): MoonstageError {
  return new MoonstageError([diagnostic("MS5003", `entity "${target}" does not exist`, { entity: target })]);
}
