/**
 * Runtime world: entities with stable authoring ids, compact integer handles,
 * hierarchical transforms and named numeric state.
 *
 * Handles are what crosses the behavior ABI; ids are what authors, tests and
 * tools use. Handles are only valid for the lifetime of one runtime.
 */

import { compose, lerp, multiply, type Matrix } from "./math.js";
import type { Components, EntitySource, SceneSource } from "./project.js";

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** Field indices used by transform_get/transform_set in the behavior ABI. */
export const TRANSFORM_FIELDS = ["x", "y", "rotation", "scaleX", "scaleY"] as const satisfies readonly (keyof Transform)[];

export interface Entity {
  readonly handle: number;
  readonly id: string;
  readonly name: string | undefined;
  readonly parent: number;
  readonly children: number[];
  active: boolean;
  transform: Transform;
  /** Transform at the start of the current tick, for render interpolation. */
  previous: Transform;
  readonly state: Map<string, number>;
  /** Source components (read-only view used by renderers and plugins). */
  readonly components: Readonly<Components>;
  readonly extensions: Readonly<Record<string, Record<string, unknown>>>;
}

function transformFrom(source: EntitySource): Transform {
  const t = source.components?.transform ?? {};
  return {
    x: t.position?.[0] ?? 0,
    y: t.position?.[1] ?? 0,
    rotation: t.rotation ?? 0,
    scaleX: t.scale?.[0] ?? 1,
    scaleY: t.scale?.[1] ?? 1,
  };
}

export class World {
  readonly entities: Entity[] = [];
  private readonly byId = new Map<string, number>();

  constructor(scene: SceneSource) {
    scene.entities.forEach((source, handle) => this.byId.set(source.id, handle));
    scene.entities.forEach((source, handle) => {
      const transform = transformFrom(source);
      this.entities.push({
        handle,
        id: source.id,
        name: source.name,
        parent: source.parent != null ? (this.byId.get(source.parent) ?? -1) : -1,
        children: [],
        active: source.active ?? true,
        transform,
        previous: { ...transform },
        state: new Map(Object.entries(source.components?.behavior?.state ?? {})),
        components: source.components ?? {},
        extensions: source.extensions ?? {},
      });
    });
    for (const e of this.entities) if (e.parent >= 0) this.entities[e.parent]!.children.push(e.handle);
  }

  /** Handle for an id, or -1. */
  handle(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  get(handle: number): Entity | undefined {
    return this.entities[handle];
  }

  byStableId(id: string): Entity | undefined {
    return this.entities[this.handle(id)];
  }

  /** Active itself and every ancestor active. */
  activeInHierarchy(handle: number): boolean {
    for (let e = this.entities[handle]; e !== undefined; e = this.entities[e.parent]) {
      if (!e.active) return false;
    }
    return true;
  }

  /** Remember transforms at the start of a tick so rendering can interpolate. */
  snapshotPrevious(): void {
    for (const e of this.entities) e.previous = { ...e.transform };
  }

  /** World matrix, interpolated between the previous and current tick by alpha. */
  worldMatrix(handle: number, alpha = 1): Matrix {
    const e = this.entities[handle]!;
    const p = e.previous;
    const c = e.transform;
    const local = compose(
      lerp(p.x, c.x, alpha),
      lerp(p.y, c.y, alpha),
      lerp(p.rotation, c.rotation, alpha),
      lerp(p.scaleX, c.scaleX, alpha),
      lerp(p.scaleY, c.scaleY, alpha),
    );
    return e.parent >= 0 ? multiply(this.worldMatrix(e.parent, alpha), local) : local;
  }
}
