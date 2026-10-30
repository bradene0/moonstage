/**
 * Headless renderer: turns a core RenderFrame into an SVG document. Used by
 * `moonstage render` so agents and CI can inspect frames without a browser.
 */

import type { DrawItem, RenderFrame } from "@moonstage/core";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (n: number) => String(Math.round(n * 1000) / 1000);

function paint(item: { fill?: string; stroke?: string; strokeWidth?: number }): string {
  const fill = `fill="${item.fill ?? "none"}"`;
  const stroke = item.stroke ? ` stroke="${item.stroke}" stroke-width="${num(item.strokeWidth ?? 1)}" vector-effect="non-scaling-stroke"` : "";
  return fill + stroke;
}

function element(item: DrawItem): string {
  const attrs = `transform="matrix(${item.matrix.map(num).join(" ")})" opacity="${num(item.opacity)}" data-entity="${escape(item.entity)}"`;
  switch (item.kind) {
    case "rect": {
      const [w, h] = item.size;
      return `<rect x="${num(-w / 2)}" y="${num(-h / 2)}" width="${num(w)}" height="${num(h)}" ${paint(item)} ${attrs}/>`;
    }
    case "circle":
      return `<circle r="${num(item.radius)}" ${paint(item)} ${attrs}/>`;
    case "polygon":
      return `<polygon points="${item.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ")}" ${paint(item)} ${attrs}/>`;
    case "text": {
      const anchor = { left: "start", center: "middle", right: "end" }[item.align];
      return `<text font-family="system-ui, sans-serif" font-size="${num(item.size)}" fill="${item.fill}" text-anchor="${anchor}" ${attrs}>${escape(item.text)}</text>`;
    }
  }
}

export function renderSvg(frame: RenderFrame): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" data-tick="${frame.tick}">`,
    `<rect width="100%" height="100%" fill="${frame.background}"/>`,
    ...frame.items.map(element),
    "</svg>",
    "",
  ].join("\n");
}
