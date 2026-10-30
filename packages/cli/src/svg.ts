/**
 * Headless renderer: turns a core RenderFrame into an SVG document. Used by
 * `moonstage render` so agents and CI can inspect frames without a browser.
 * Images are embedded as data URIs so the SVG is a single self-contained file.
 */

import type { DrawItem, RenderFrame, SpriteItem } from "@moonstage/core";

/** An image asset prepared for embedding. */
export interface SvgImage {
  href: string;
  width?: number;
  height?: number;
  pixelated?: boolean;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (n: number) => String(Math.round(n * 1000) / 1000);

function paint(item: { fill?: string; stroke?: string; strokeWidth?: number }): string {
  const fill = `fill="${item.fill ?? "none"}"`;
  const stroke = item.stroke ? ` stroke="${item.stroke}" stroke-width="${num(item.strokeWidth ?? 1)}" vector-effect="non-scaling-stroke"` : "";
  return fill + stroke;
}

function sprite(item: SpriteItem, attrs: string, images: ReadonlyMap<string, SvgImage>): string {
  const image = images.get(item.asset);
  const natural: [number, number] | undefined = image?.width && image.height ? [image.width, image.height] : undefined;
  const [w, h] = item.size ?? natural ?? [16, 16];
  const x = num(-item.anchor[0] * w);
  const y = num(-item.anchor[1] * h);
  if (image === undefined) {
    return `<rect x="${x}" y="${y}" width="${num(w)}" height="${num(h)}" fill="#ff00ff" ${attrs} data-missing-asset="${escape(item.asset)}"/>`;
  }
  const viewBox = item.source ?? (natural ? [0, 0, natural[0], natural[1]] : undefined);
  if (viewBox === undefined) {
    return `<use href="#asset-${item.asset}" x="${x}" y="${y}" width="${num(w)}" height="${num(h)}" ${attrs}/>`;
  }
  return (
    `<svg x="${x}" y="${y}" width="${num(w)}" height="${num(h)}" viewBox="${viewBox.map(num).join(" ")}" ` +
    `preserveAspectRatio="none" overflow="hidden" ${attrs}><use href="#asset-${item.asset}"/></svg>`
  );
}

function element(item: DrawItem, images: ReadonlyMap<string, SvgImage>): string {
  const attrs = `opacity="${num(item.opacity)}" data-entity="${escape(item.entity)}"`;
  const transform = `transform="matrix(${item.matrix.map(num).join(" ")})"`;
  switch (item.kind) {
    case "rect": {
      const [w, h] = item.size;
      return `<rect x="${num(-w / 2)}" y="${num(-h / 2)}" width="${num(w)}" height="${num(h)}" ${paint(item)} ${transform} ${attrs}/>`;
    }
    case "circle":
      return `<circle r="${num(item.radius)}" ${paint(item)} ${transform} ${attrs}/>`;
    case "polygon":
      return `<polygon points="${item.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ")}" ${paint(item)} ${transform} ${attrs}/>`;
    case "text": {
      const anchor = { left: "start", center: "middle", right: "end" }[item.align];
      return `<text font-family="system-ui, sans-serif" font-size="${num(item.size)}" fill="${item.fill}" text-anchor="${anchor}" ${transform} ${attrs}>${escape(item.text)}</text>`;
    }
    case "sprite":
      // Nested <svg> elements ignore `transform`, so wrap them in a group.
      return `<g ${transform}>${sprite(item, `${attrs} data-frame="${item.frame}"`, images)}</g>`;
  }
}

export function renderSvg(frame: RenderFrame, images: ReadonlyMap<string, SvgImage> = new Map()): string {
  const used = new Set(frame.items.flatMap((i) => (i.kind === "sprite" && images.has(i.asset) ? [i.asset] : [])));
  const defs = [...used].map((id) => {
    const image = images.get(id)!;
    const size = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : "";
    const style = image.pixelated ? ` style="image-rendering:pixelated"` : "";
    return `<image id="asset-${id}" href="${image.href}"${size} preserveAspectRatio="none"${style}/>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" data-tick="${frame.tick}">`,
    ...(defs.length > 0 ? ["<defs>", ...defs, "</defs>"] : []),
    `<rect width="100%" height="100%" fill="${frame.background}"/>`,
    ...frame.items.map((item) => element(item, images)),
    "</svg>",
    "",
  ].join("\n");
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Natural size from the file header, for formats where that is cheap to read. */
export function imageSize(bytes: Uint8Array, extension: string): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (extension === "png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (extension === "gif" && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (extension === "jpg" || extension === "jpeg") {
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      i += 2 + view.getUint16(i + 2);
    }
    return undefined;
  }
  if (extension === "svg") {
    const head = new TextDecoder().decode(bytes.subarray(0, 2048));
    const w = /<svg[^>]*\swidth="([\d.]+)(px)?"/.exec(head)?.[1];
    const h = /<svg[^>]*\sheight="([\d.]+)(px)?"/.exec(head)?.[1];
    return w && h ? { width: Number(w), height: Number(h) } : undefined;
  }
  return undefined;
}

export function svgImage(bytes: Uint8Array, path: string, pixelated = false): SvgImage {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const href = `data:${MIME[extension] ?? "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`;
  return { href, pixelated, ...imageSize(bytes, extension) };
}
