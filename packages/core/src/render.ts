/**
 * Rendering abstraction. Core turns the world into a RenderFrame: a flat,
 * sorted list of draw items with fully resolved screen-space matrices.
 * Renderers (Canvas 2D in the player, SVG in the CLI, future WebGL/WebGPU
 * plugins) only consume frames; they never read the world directly.
 *
 * Project files describe intent; renderers decide implementation.
 */

import { compose, lerp, multiply, type Matrix } from "./math.js";
import { TEXT_BINDING, type Vec2 } from "./project.js";
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

export type DrawItem = RectItem | CircleItem | PolygonItem | TextItem;

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
  for (const e of world.entities) {
    const { shape, text } = e.components;
    if ((shape === undefined && text === undefined) || !world.activeInHierarchy(e.handle)) continue;
    const local = world.worldMatrix(e.handle, alpha);
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
