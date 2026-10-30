/**
 * Source project model: the TypeScript shape of moonstage.json, scene files
 * and test files, plus validation (schema + semantic checks).
 *
 * These types describe the authoring contract. The runtime compiles them into
 * its own internal structures; nothing here mirrors internal memory layout.
 */

import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { projectSchema, sceneSchema, testSchema } from "./schema/schemas.js";
import { validateSchema, type JsonSchema } from "./schema/validate.js";
import { PROJECT_FORMAT } from "./versions.js";

export type Vec2 = [number, number];

export interface ProjectManifest {
  $schema?: string;
  format: number;
  name: string;
  description?: string;
  entryScene: string;
  scenes: Record<string, string>;
  display?: { width?: number; height?: number; background?: string };
  simulation?: { tickRate?: number; seed?: number };
  input?: {
    axes?: Record<string, { negative?: string[]; positive?: string[] }>;
    buttons?: Record<string, string[]>;
  };
  assets?: Record<string, AssetDecl>;
  behaviors?: Record<string, BehaviorModuleDecl>;
  physics?: { gravity?: Vec2 };
  prefabs?: Record<string, PrefabSource>;
  plugins?: Record<string, { module: string; config?: Record<string, unknown> }>;
}

export interface AssetDecl {
  path: string;
  type?: string;
  /** Sprite sheet layout. */
  frame?: { width: number; height: number; columns?: number; count?: number };
  pixelated?: boolean;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

/** True for assets the built-in renderers draw as images. */
export function isImageAsset(asset: AssetDecl): boolean {
  return asset.type === "image" || (asset.type === undefined && IMAGE_EXTENSIONS.test(asset.path));
}

/** An entity template that can be spawned at runtime. */
export type PrefabSource = Omit<EntitySource, "id" | "parent">;

export interface BehaviorModuleDecl {
  description?: string;
  language?: "moonbit" | "wasm";
  source?: string;
  wasm?: string;
  params?: string[];
  state?: string[];
  refs?: string[];
  inputs?: string[];
  events?: string[];
  prefabs?: string[];
}

export interface TransformComponent {
  position?: Vec2;
  rotation?: number;
  scale?: Vec2;
}

export interface ShapeComponent {
  kind: "rect" | "circle" | "polygon";
  size?: Vec2;
  radius?: number;
  points?: Vec2[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  layer?: number;
  space?: "world" | "screen";
}

export interface TextComponent {
  value: string;
  size?: number;
  fill?: string;
  align?: "left" | "center" | "right";
  opacity?: number;
  layer?: number;
  space?: "world" | "screen";
}

export interface BehaviorComponent {
  module: string;
  params?: Record<string, number>;
  refs?: Record<string, string>;
  state?: Record<string, number>;
}

export interface SpriteComponent {
  asset: string;
  size?: Vec2;
  anchor?: Vec2;
  frame?: number;
  frameState?: string;
  animation?: { fps: number; frames?: number[]; loop?: boolean };
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
  layer?: number;
  space?: "world" | "screen";
}

export interface PhysicsBodyComponent {
  type?: "dynamic" | "static" | "kinematic";
  mass?: number;
  velocity?: Vec2;
  angularVelocity?: number;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  fixedRotation?: boolean;
}

export interface ColliderComponent {
  shape: "circle" | "box" | "polygon";
  radius?: number;
  size?: Vec2;
  points?: Vec2[];
  offset?: Vec2;
  density?: number;
  friction?: number;
  restitution?: number;
  sensor?: boolean;
}

export interface JointComponent {
  type: "distance" | "revolute" | "weld";
  target: string;
  anchor?: Vec2;
  targetAnchor?: Vec2;
  length?: number;
  motorSpeed?: number;
  maxMotorTorque?: number;
}

/** Components that need a plugin that `provides: ["physics"]`. */
export const PHYSICS_COMPONENTS = ["physicsBody", "collider", "joint"] as const;

export interface CameraComponent {
  zoom?: number;
}

export interface Components {
  transform?: TransformComponent;
  shape?: ShapeComponent;
  text?: TextComponent;
  sprite?: SpriteComponent;
  physicsBody?: PhysicsBodyComponent;
  collider?: ColliderComponent;
  joint?: JointComponent;
  /** One behavior, or several that run in order. */
  behavior?: BehaviorComponent | BehaviorComponent[];
  camera?: CameraComponent;
}

/** The behaviors attached to an entity, always as a list. */
export function behaviorsOf(components: Components | undefined): BehaviorComponent[] {
  const b = components?.behavior;
  return b === undefined ? [] : Array.isArray(b) ? b : [b];
}

export interface EntitySource {
  id: string;
  name?: string;
  parent?: string | null;
  active?: boolean;
  components?: Components;
  extensions?: Record<string, Record<string, unknown>>;
}

export interface SceneSource {
  $schema?: string;
  format: number;
  camera?: string;
  entities: EntitySource[];
}

export type Comparison = {
  equals?: number | boolean;
  approx?: number;
  tolerance?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
};

export type Assertion =
  | { event: string; count?: Comparison }
  | { prefab: string; count?: Comparison }
  | ({ target: string; property: string } & Comparison)
  | { target: string; exists: boolean };

export interface TestSource {
  $schema?: string;
  format: number;
  name: string;
  scene?: string;
  seed?: number;
  ticks: number;
  setup?: import("./operations.js").Operation[];
  input?: { tick: number; set: Record<string, number> }[];
  expect: Assertion[];
}

/** Placeholder syntax inside text components: {entityId.stateName}. */
export const TEXT_BINDING = /\{([A-Za-z][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_-]*)\}/g;

function schemaDiagnostics(schema: JsonSchema, value: unknown, file: string | undefined): Diagnostic[] {
  return validateSchema(schema, value).map((issue) =>
    diagnostic("MS1001", `${issue.path}: ${issue.message}`, { file, path: issue.path }),
  );
}

function formatDiagnostic(value: unknown, file: string | undefined): Diagnostic[] {
  const format = (value as { format?: unknown } | null)?.format;
  if (typeof format === "number" && format !== PROJECT_FORMAT) {
    return [
      diagnostic("MS1004", `format ${format} is not supported; this runtime reads format ${PROJECT_FORMAT}`, {
        file,
        path: "format",
      }),
    ];
  }
  return [];
}

export function validateManifestShape(value: unknown, file = "moonstage.json"): Diagnostic[] {
  return [...formatDiagnostic(value, file), ...schemaDiagnostics(projectSchema, value, file)];
}

export function validateSceneShape(value: unknown, file?: string): Diagnostic[] {
  return [...formatDiagnostic(value, file), ...schemaDiagnostics(sceneSchema, value, file)];
}

export function validateTestShape(value: unknown, file?: string): Diagnostic[] {
  return schemaDiagnostics(testSchema, value, file).map((d) => ({ ...d, code: "MS5002" }));
}

/** Names that behaviors can read through input(slot). */
export function inputNames(manifest: ProjectManifest): Set<string> {
  return new Set([...Object.keys(manifest.input?.axes ?? {}), ...Object.keys(manifest.input?.buttons ?? {})]);
}

/**
 * Semantic checks that span files: references between entities, behaviors,
 * inputs and plugins. Assumes each file already passed its schema.
 */
export function validateProjectSemantics(
  manifest: ProjectManifest,
  scenes: Record<string, SceneSource>,
  sceneFiles: Record<string, string> = manifest.scenes,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const behaviors = manifest.behaviors ?? {};
  const plugins = manifest.plugins ?? {};
  const inputs = inputNames(manifest);

  if (!(manifest.entryScene in manifest.scenes)) {
    out.push(
      diagnostic("MS2004", `entryScene "${manifest.entryScene}" is not declared in scenes`, {
        file: "moonstage.json",
        path: "entryScene",
      }),
    );
  }

  for (const [name, decl] of Object.entries(behaviors)) {
    const path = `behaviors.${name}`;
    if ((decl.source === undefined) === (decl.wasm === undefined)) {
      out.push(
        diagnostic("MS1001", `${path}: set exactly one of "source" (MoonBit) or "wasm" (prebuilt)`, {
          file: "moonstage.json",
          path,
        }),
      );
    }
    for (const input of decl.inputs ?? []) {
      if (!inputs.has(input)) {
        out.push(
          diagnostic("MS2009", `${path}.inputs: "${input}" is not declared in input.axes or input.buttons`, {
            file: "moonstage.json",
            path: `${path}.inputs`,
          }),
        );
      }
    }
  }

  const prefabs = manifest.prefabs ?? {};
  for (const [name, decl] of Object.entries(behaviors)) {
    for (const prefab of decl.prefabs ?? []) {
      if (!(prefab in prefabs)) {
        out.push(
          diagnostic("MS2014", `behaviors.${name}.prefabs: "${prefab}" is not declared in prefabs`, {
            file: "moonstage.json",
            path: `behaviors.${name}.prefabs`,
          }),
        );
      }
    }
  }
  for (const [name, prefab] of Object.entries(prefabs)) {
    const where = { file: "moonstage.json", entity: name };
    // Prefab refs resolve against whichever scene spawns them, so only names are checked here.
    out.push(...checkBehaviors(prefab, manifest, `prefabs.${name}.components.behavior`, where, undefined));
    out.push(...checkSprite(prefab, manifest, `prefabs.${name}.components.sprite`, where));
    for (const namespace of Object.keys(prefab.extensions ?? {})) {
      if (!(namespace in plugins)) {
        out.push(
          diagnostic("MS2011", `extension "${namespace}" has no matching plugin in moonstage.json`, {
            ...where,
            severity: "warning",
            path: `prefabs.${name}.extensions.${namespace}`,
          }),
        );
      }
    }
  }

  for (const [sceneId, scene] of Object.entries(scenes)) {
    const file = sceneFiles[sceneId];
    const byId = new Map<string, EntitySource>();
    scene.entities.forEach((entity, i) => {
      if (byId.has(entity.id)) {
        out.push(
          diagnostic("MS2001", `duplicate entity id "${entity.id}"`, { file, path: `entities[${i}].id`, entity: entity.id }),
        );
      }
      byId.set(entity.id, entity);
    });

    scene.entities.forEach((entity, i) => {
      const at = (rest: string) => `entities[${i}]${rest}`;
      const where = { file, entity: entity.id };

      if (entity.parent != null && !byId.has(entity.parent)) {
        out.push(diagnostic("MS2002", `parent "${entity.parent}" does not exist`, { ...where, path: at(".parent") }));
      }
      // Walk up the parent chain to find cycles.
      const seen = new Set<string>([entity.id]);
      let cursor = entity.parent;
      while (cursor != null) {
        if (seen.has(cursor)) {
          out.push(diagnostic("MS2003", `entity "${entity.id}" is part of a parent cycle`, { ...where, path: at(".parent") }));
          break;
        }
        seen.add(cursor);
        cursor = byId.get(cursor)?.parent;
      }

      out.push(...checkBehaviors(entity, manifest, at(".components.behavior"), { file, entity: entity.id }, byId));

      for (const namespace of Object.keys(entity.extensions ?? {})) {
        if (!(namespace in plugins)) {
          out.push(
            diagnostic("MS2011", `extension "${namespace}" has no matching plugin in moonstage.json`, {
              ...where,
              severity: "warning",
              path: at(`.extensions.${namespace}`),
            }),
          );
        }
      }

      out.push(...checkSprite(entity, manifest, at(".components.sprite"), where));
      const joint = entity.components?.joint;
      if (joint !== undefined && (!byId.has(joint.target) || joint.target === entity.id)) {
        out.push(
          diagnostic("MS2016", `joint target "${joint.target}" is not another entity in this scene`, {
            ...where,
            component: "joint",
            path: at(".components.joint.target"),
          }),
        );
      }

      const text = entity.components?.text;
      if (text !== undefined) {
        for (const match of text.value.matchAll(TEXT_BINDING)) {
          const [, targetId, stateName] = match;
          const target = byId.get(targetId!);
          const declared = behaviorsOf(target?.components).flatMap((b) => behaviors[b.module]?.state ?? []);
          if (!declared.includes(stateName!)) {
            out.push(
              diagnostic("MS2012", `text binding {${targetId}.${stateName}} does not match any entity state`, {
                ...where,
                severity: "warning",
                component: "text",
                path: at(".components.text.value"),
              }),
            );
          }
        }
      }
    });

    if (scene.camera !== undefined && byId.get(scene.camera)?.components?.camera === undefined) {
      out.push(
        diagnostic("MS2010", `camera "${scene.camera}" is not an entity with a camera component`, {
          file,
          path: "camera",
        }),
      );
    }
  }
  return out;
}

/** Check an entity's (or prefab's) behavior entries against their module declarations. */
function checkBehaviors(
  entity: PrefabSource,
  manifest: ProjectManifest,
  basePath: string,
  where: { file: string | undefined; entity: string },
  byId: Map<string, EntitySource> | undefined,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const list = behaviorsOf(entity.components);
  const many = Array.isArray(entity.components?.behavior);
  list.forEach((behavior, i) => {
    const bpath = many ? `${basePath}[${i}]` : basePath;
    const bwhere = { ...where, component: "behavior" };
    const decl = manifest.behaviors?.[behavior.module];
    if (decl === undefined) {
      out.push(
        diagnostic("MS2005", `behavior module "${behavior.module}" is not declared in moonstage.json`, {
          ...bwhere,
          path: `${bpath}.module`,
        }),
      );
      return;
    }
    const params = new Set(decl.params ?? []);
    for (const key of Object.keys(behavior.params ?? {})) {
      if (!params.has(key)) {
        out.push(
          diagnostic("MS2006", `param "${key}" is not declared by behavior "${behavior.module}"`, {
            ...bwhere,
            path: `${bpath}.params.${key}`,
          }),
        );
      }
    }
    const refs = new Set(decl.refs ?? []);
    for (const [key, target] of Object.entries(behavior.refs ?? {})) {
      if (!refs.has(key)) {
        out.push(
          diagnostic("MS2007", `ref "${key}" is not declared by behavior "${behavior.module}"`, {
            ...bwhere,
            path: `${bpath}.refs.${key}`,
          }),
        );
      } else if (byId !== undefined && !byId.has(target)) {
        out.push(
          diagnostic("MS2007", `ref "${key}" points to missing entity "${target}"`, {
            ...bwhere,
            path: `${bpath}.refs.${key}`,
          }),
        );
      }
    }
    const state = new Set(decl.state ?? []);
    for (const key of Object.keys(behavior.state ?? {})) {
      if (!state.has(key)) {
        out.push(
          diagnostic("MS2008", `state "${key}" is not declared by behavior "${behavior.module}"`, {
            ...bwhere,
            path: `${bpath}.state.${key}`,
          }),
        );
      }
    }
  });
  return out;
}

/** Check a sprite's asset reference and frame state against the manifest. */
function checkSprite(
  entity: PrefabSource,
  manifest: ProjectManifest,
  path: string,
  where: { file: string | undefined; entity: string },
): Diagnostic[] {
  const sprite = entity.components?.sprite;
  if (sprite === undefined) return [];
  const out: Diagnostic[] = [];
  const swhere = { ...where, component: "sprite" };
  const asset = manifest.assets?.[sprite.asset];
  if (asset === undefined) {
    out.push(diagnostic("MS2015", `asset "${sprite.asset}" is not declared in moonstage.json`, { ...swhere, path: `${path}.asset` }));
  } else if (!isImageAsset(asset)) {
    out.push(diagnostic("MS2015", `asset "${sprite.asset}" is not an image`, { ...swhere, path: `${path}.asset` }));
  } else {
    const count = asset.frame ? (asset.frame.count ?? asset.frame.columns ?? 1) : 1;
    const used = [sprite.frame ?? 0, ...(sprite.animation?.frames ?? [])];
    if (used.some((f) => f >= count)) {
      out.push(
        diagnostic("MS2015", `sprite uses a frame >= ${count}, the frame count of asset "${sprite.asset}"`, {
          ...swhere,
          path,
          hint: "Declare `frame.count`/`frame.columns` on the asset, or use a lower frame index.",
        }),
      );
    }
  }
  if (sprite.frameState !== undefined) {
    const declared = behaviorsOf(entity.components).flatMap((b) => manifest.behaviors?.[b.module]?.state ?? []);
    if (!declared.includes(sprite.frameState)) {
      out.push(
        diagnostic("MS2012", `frameState "${sprite.frameState}" is not a state of this entity's behaviors`, {
          ...swhere,
          severity: "warning",
          path: `${path}.frameState`,
        }),
      );
    }
  }
  return out;
}
