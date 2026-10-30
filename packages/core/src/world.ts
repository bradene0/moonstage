/**
 * Runtime world: entities with stable authoring ids, compact integer handles,
 * hierarchical transforms and named numeric state.
 *
 * Handles are what crosses the behavior ABI; ids are what authors, tests and
 * tools use. Handles are only valid for the lifetime of one runtime and are
 * never reused: a removed entity's handle stays invalid, so a behavior holding
 * a stale handle can never touch a different entity by accident.
 */

import { compose, lerp, multiply, type Matrix } from "./math.js";
import { behaviorsOf, type Components, type EntitySource, type PrefabSource, type SceneSource } from "./project.js";

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
  /** Name of the prefab this entity was spawned from, if any. */
  readonly prefab: string | undefined;
  /** Tick the entity was created at (0 for scene entities). Sprite animations count from here. */
  born: number;
}

function transformFrom(source: PrefabSource): Transform {
  const t = source.components?.transform ?? {};
  return {
    x: t.position?.[0] ?? 0,
    y: t.position?.[1] ?? 0,
    rotation: t.rotation ?? 0,
    scaleX: t.scale?.[0] ?? 1,
    scaleY: t.scale?.[1] ?? 1,
  };
}

/** Initial state: every behavior entry's `state`, merged in order. */
function initialState(source: PrefabSource): Map<string, number> {
  return new Map(behaviorsOf(source.components).flatMap((b) => Object.entries(b.state ?? {})));
}

export class World {
  /** Live entities: scene entities in scene order, then spawned entities in spawn order. */
  entities: Entity[] = [];
  private readonly slots: (Entity | undefined)[] = [];
  private readonly byId = new Map<string, number>();
  private readonly spawnCounters = new Map<string, number>();

  constructor(scene: SceneSource) {
    scene.entities.forEach((source, handle) => this.byId.set(source.id, handle));
    for (const source of scene.entities) {
      this.insert(source, source.id, source.parent != null ? (this.byId.get(source.parent) ?? -1) : -1, undefined);
    }
  }

  private insert(source: PrefabSource, id: string, parent: number, prefab: string | undefined): Entity {
    const transform = transformFrom(source);
    const entity: Entity = {
      handle: this.slots.length,
      id,
      name: source.name,
      parent,
      children: [],
      active: source.active ?? true,
      transform,
      previous: { ...transform },
      state: initialState(source),
      components: source.components ?? {},
      extensions: source.extensions ?? {},
      prefab,
      born: 0,
    };
    this.slots.push(entity);
    this.entities.push(entity);
    this.byId.set(id, entity.handle);
    if (parent >= 0) this.slots[parent]?.children.push(entity.handle);
    return entity;
  }

  /** Create an entity from a prefab with a generated id "<prefab>-<n>", at the root. */
  spawn(prefabName: string, prefab: PrefabSource): Entity {
    let n = this.spawnCounters.get(prefabName) ?? 0;
    let id: string;
    do {
      n += 1;
      id = `${prefabName}-${n}`;
    } while (this.byId.has(id));
    this.spawnCounters.set(prefabName, n);
    return this.insert(prefab, id, -1, prefabName);
  }

  /** Remove entities and all their descendants. Returns the removed entities, parents first. */
  remove(handles: Iterable<number>): Entity[] {
    const removed: Entity[] = [];
    const visit = (handle: number) => {
      const e = this.slots[handle];
      if (e === undefined) return;
      this.slots[handle] = undefined;
      this.byId.delete(e.id);
      removed.push(e);
      for (const child of e.children) visit(child);
    };
    for (const handle of handles) visit(handle);
    if (removed.length === 0) return removed;
    const gone = new Set(removed.map((e) => e.handle));
    for (const e of removed) {
      const parent = this.slots[e.parent];
      if (parent !== undefined) parent.children.splice(parent.children.indexOf(e.handle), 1);
    }
    this.entities = this.entities.filter((e) => !gone.has(e.handle));
    return removed;
  }

  /** Handle for an id, or -1. */
  handle(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  get(handle: number): Entity | undefined {
    return this.slots[handle];
  }

  byStableId(id: string): Entity | undefined {
    return this.slots[this.handle(id)];
  }

  /** Active itself and every ancestor active. */
  activeInHierarchy(handle: number): boolean {
    for (let e = this.slots[handle]; e !== undefined; e = this.slots[e.parent]) {
      if (!e.active) return false;
    }
    return true;
  }

  /** Remember transforms at the start of a tick so rendering can interpolate. */
  snapshotPrevious(): void {
    for (const e of this.entities) {
      const p = e.previous;
      const t = e.transform;
      p.x = t.x;
      p.y = t.y;
      p.rotation = t.rotation;
      p.scaleX = t.scaleX;
      p.scaleY = t.scaleY;
    }
  }

  /**
   * World matrix, interpolated between the previous and current tick by alpha.
   * Pass a cache when computing many matrices for one frame so shared
   * ancestors are composed once.
   */
  worldMatrix(handle: number, alpha = 1, cache?: Map<number, Matrix>): Matrix {
    const cached = cache?.get(handle);
    if (cached !== undefined) return cached;
    const e = this.slots[handle]!;
    const p = e.previous;
    const c = e.transform;
    const local = compose(
      lerp(p.x, c.x, alpha),
      lerp(p.y, c.y, alpha),
      lerp(p.rotation, c.rotation, alpha),
      lerp(p.scaleX, c.scaleX, alpha),
      lerp(p.scaleY, c.scaleY, alpha),
    );
    const m = e.parent >= 0 && this.slots[e.parent] !== undefined ? multiply(this.worldMatrix(e.parent, alpha, cache), local) : local;
    // Only entities with children are reused as ancestors, so only they are worth caching.
    if (e.children.length > 0) cache?.set(handle, m);
    return m;
  }
}
