/** Canvas 2D implementation of the core Renderer interface. */

import type { CustomItem, DrawItem, RenderFrame, Renderer, SpriteItem } from "@moonstage/core";

/** Draws a plugin-owned item; returns false when no plugin can draw it. */
export type CustomDraw = (context: CanvasRenderingContext2D, item: CustomItem) => boolean;

/** Loaded images by asset id. Anything drawImage accepts (HTMLImageElement, ImageBitmap, ...). */
export type ImageMap = ReadonlyMap<string, CanvasImageSource & { width: number; height: number }>;

export class CanvasRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly warned = new Set<string>();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly images: ImageMap = new Map(),
    private readonly drawCustom: CustomDraw = () => false,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  render(frame: RenderFrame): void {
    const { canvas, ctx } = this;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.round(frame.width * dpr);
    const h = Math.round(frame.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = frame.background;
    ctx.fillRect(0, 0, frame.width, frame.height);
    for (const item of frame.items) this.draw(item, dpr);
  }

  private draw(item: DrawItem, dpr: number): void {
    const { ctx } = this;
    const [a, b, c, d, e, f] = item.matrix;
    ctx.globalAlpha = item.opacity;
    ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, f * dpr);

    if (item.kind === "text") {
      ctx.font = `${item.size}px system-ui, sans-serif`;
      ctx.textAlign = item.align;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = item.fill;
      ctx.fillText(item.text, 0, 0);
      return;
    }
    if (item.kind === "sprite") {
      this.drawSprite(item);
      return;
    }
    if (item.kind === "custom") {
      // Plugins may change any context state; isolate them.
      ctx.save();
      const drawn = this.drawCustom(ctx, item);
      ctx.restore();
      if (!drawn && !this.warned.has(`plugin:${item.plugin}`)) {
        this.warned.add(`plugin:${item.plugin}`);
        console.warn(`moonstage: plugin "${item.plugin}" has no drawCanvas2d hook`);
      }
      return;
    }

    ctx.beginPath();
    if (item.kind === "rect") {
      const [w, h] = item.size;
      ctx.rect(-w / 2, -h / 2, w, h);
    } else if (item.kind === "circle") {
      ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
    } else {
      item.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    }
    if (item.fill !== undefined) {
      ctx.fillStyle = item.fill;
      ctx.fill();
    }
    if (item.stroke !== undefined) {
      // Stroke in screen pixels regardless of the item's scale.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = item.stroke;
      ctx.lineWidth = item.strokeWidth ?? 1;
      ctx.stroke();
    }
  }

  private drawSprite(item: SpriteItem): void {
    const { ctx } = this;
    const image = this.images.get(item.asset);
    const [w, h] = item.size ?? (image ? [image.width, image.height] : [16, 16]);
    const x = -item.anchor[0] * w;
    const y = -item.anchor[1] * h;
    if (image === undefined) {
      // Visible placeholder so a missing image is obvious rather than silent.
      if (!this.warned.has(item.asset)) {
        this.warned.add(item.asset);
        console.warn(`moonstage: image for asset "${item.asset}" is not loaded`);
      }
      ctx.fillStyle = "#ff00ff";
      ctx.fillRect(x, y, w, h);
      return;
    }
    ctx.imageSmoothingEnabled = !item.pixelated;
    if (item.source) {
      const [sx, sy, sw, sh] = item.source;
      ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    } else {
      ctx.drawImage(image, x, y, w, h);
    }
  }
}
