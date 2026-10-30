/**
 * Rendering abstraction. Core turns the world into a RenderFrame: a flat,
 * sorted list of draw items with fully resolved screen-space matrices.
 * Renderers (Canvas 2D in the player, SVG in the CLI, future WebGL/WebGPU
 * plugins) only consume frames; they never read the world directly.
 *
 * Project files describe intent; renderers decide implementation.
 */

import { compose, lerp, multiply, type Matrix } from "./math.js";
import { TEXT_BINDING, type AssetDecl, type SpriteComponent, type Vec2 } from "./project.js";
import type { Entity } from "./world.js";
import type { Runtime } from "./runtime.js";

interface DrawBase {
  /** Stable id of the entity that produced this item. */
  entity: string;
  /** Local -> screen pixels. */
  matrix: Matrix;
  layer: number;
  opacity: number;
}

export interface RectItem extends DrawBase {
  kind: "rect";
  size: Vec2;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface CircleItem extends DrawBase {
  kind: "circle";
  radius: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface PolygonItem extends DrawBase {
  kind: "polygon";
  points: Vec2[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface TextItem extends DrawBase {
  kind: "text";
  text: string;
  size: number;
  fill: string;
  align: "left" | "center" | "right";
}

export interface SpriteItem extends DrawBase {
  kind: "sprite";
  /** Asset id; renderers map it to a loaded image. */
  asset: string;
  /** Drawn size in local pixels; undefined means the image's natural size. */
  size: Vec2 | undefined;
  /** 0..1 point of the image placed at the local origin. */
  anchor: Vec2;
  /** Source rectangle [x, y, width, height] in the image; undefined means the whole image. */
  source: [number, number, number, number] | undefined;
  /** Frame index that was selected. */
  frame: number;
  pixelated: boolean;
}

export type DrawItem = RectItem | CircleItem | PolygonItem | TextItem | SpriteItem;

export interface RenderFrame {
  width: number;
  height: number;
  background: string;
  tick: number;
  camera: { x: number; y: number; zoom: number; rotation: number };
  /** Sorted back to front. */
  items: DrawItem[];
}

/** Anything that can draw frames. Renderer plugins implement this. */
export interface Renderer {
  render(frame: RenderFrame): void;
  dispose?(): void;
}

/** FNV-1a: a small, stable hash so "auto" offsets are the same on every platform and run. */
function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Which sprite-sheet frame to show: frameState, then animation, then the static frame. */
export function spriteFrame(sprite: SpriteComponent, asset: AssetDecl | undefined, entity: Entity, tick: number, dt: number): number {
  const count = asset?.frame ? (asset.frame.count ?? asset.frame.columns ?? 1) : 1;
  if (sprite.frameState !== undefined) {
    const value = Math.floor(entity.state.get(sprite.frameState) ?? 0);
    return ((value % count) + count) % count;
  }
  if (sprite.animation !== undefined) {
    const frames = sprite.animation.frames ?? Array.from({ length: count }, (_, i) => i);
    const offset = sprite.animation.offset === "auto" ? stableHash(entity.id) % frames.length : (sprite.animation.offset ?? 0);
    const step = Math.floor((tick - entity.born) * dt * sprite.animation.fps) + offset;
    const index = sprite.animation.loop === false ? Math.min(step, frames.length - 1) : step % frames.length;
    return frames[Math.max(0, index)] ?? 0;
  }
  return sprite.frame ?? 0;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function buildFrame(rt: Runtime, alpha: number): RenderFrame {
  const { world } = rt;
  const width = rt.manifest.display?.width ?? 800;
  const height = rt.manifest.display?.height ?? 600;

  // Camera: the view is centered on the camera entity's interpolated world position.
  let camera = { x: width / 2, y: height / 2, zoom: 1, rotation: 0 };
  const cameraHandle = rt.scene.camera !== undefined ? world.handle(rt.scene.camera) : -1;
  if (cameraHandle >= 0) {
    const m = world.worldMatrix(cameraHandle, alpha);
    const e = world.get(cameraHandle)!;
    camera = {
      x: m[4],
      y: m[5],
      zoom: e.components.camera?.zoom ?? 1,
      rotation: lerp(e.previous.rotation, e.transform.rotation, alpha),
    };
  }
  const view = multiply(
    compose(width / 2, height / 2, -camera.rotation, camera.zoom, camera.zoom),
    [1, 0, 0, 1, -camera.x, -camera.y],
  );

  const items: DrawItem[] = [];
  const matrices = new Map<number, Matrix>();
  for (const e of world.entities) {
    const { shape, text, sprite } = e.components;
    if ((shape === undefined && text === undefined && sprite === undefined) || !world.activeInHierarchy(e.handle)) continue;
    const local = world.worldMatrix(e.handle, alpha, matrices);
    if (shape !== undefined) {
      const base = {
        entity: e.id,
        matrix: shape.space === "screen" ? local : multiply(view, local),
        layer: shape.layer ?? 0,
        opacity: shape.opacity ?? 1,
        ...(shape.fill !== undefined && { fill: shape.fill }),
        ...(shape.stroke !== undefined && { stroke: shape.stroke, strokeWidth: shape.strokeWidth ?? 1 }),
      };
      if (shape.kind === "rect") items.push({ ...base, kind: "rect", size: shape.size ?? [10, 10] });
      else if (shape.kind === "circle") items.push({ ...base, kind: "circle", radius: shape.radius ?? 5 });
      else items.push({ ...base, kind: "polygon", points: shape.points ?? [] });
    }
    if (sprite !== undefined) {
      const asset = rt.manifest.assets?.[sprite.asset];
      const frame = spriteFrame(sprite, asset, e, rt.tick, rt.dt);
      const f = asset?.frame;
      const columns = f?.columns ?? 1;
      const flip: Matrix = [sprite.flipX ? -1 : 1, 0, 0, sprite.flipY ? -1 : 1, 0, 0];
      items.push({
        entity: e.id,
        kind: "sprite",
        matrix: multiply(sprite.space === "screen" ? local : multiply(view, local), flip),
        layer: sprite.layer ?? 0,
        opacity: sprite.opacity ?? 1,
        asset: sprite.asset,
        size: sprite.size ?? (f ? [f.width, f.height] : undefined),
        anchor: sprite.anchor ?? [0.5, 0.5],
        source: f ? [(frame % columns) * f.width, Math.floor(frame / columns) * f.height, f.width, f.height] : undefined,
        frame,
        pixelated: asset?.pixelated ?? false,
      });
    }
    if (text !== undefined) {
      const value = text.value.replace(TEXT_BINDING, (_, id: string, key: string) =>
        formatNumber(world.byStableId(id)?.state.get(key) ?? 0),
      );
      items.push({
        entity: e.id,
        kind: "text",
        matrix: text.space === "screen" ? local : multiply(view, local),
        layer: text.layer ?? 0,
        opacity: text.opacity ?? 1,
        text: value,
        size: text.size ?? 16,
        fill: text.fill ?? "#ffffff",
        align: text.align ?? "left",
      });
    }
  }
  // Stable sort keeps scene order within a layer.
  items.sort((a, b) => a.layer - b.layer);

  return {
    width,
    height,
    background: rt.manifest.display?.background ?? "#000000",
    tick: rt.tick,
    camera,
    items,
  };
}
