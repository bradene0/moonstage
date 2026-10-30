/** Canvas 2D implementation of the core Renderer interface. */

import type { DrawItem, RenderFrame, Renderer } from "@moonstage/core";

export class CanvasRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
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
}
