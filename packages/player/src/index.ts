/**
 * @moonstage/player — play a Moonstage project in the browser.
 *
 *   import { play } from "@moonstage/player";
 *   const game = await play("#game", "./my-game/");
 *
 * or, declaratively, import "@moonstage/player/element" and use
 * <moonstage-player src="./my-game/"></moonstage-player>.
 */

import {
  diagnostic,
  isImageAsset,
  KeyBindings,
  loadProject,
  MoonstageError,
  Runtime,
  type Diagnostic,
  type ProjectIO,
  type ProjectManifest,
  type Renderer,
} from "@moonstage/core";
import { CanvasRenderer, type ImageMap } from "./canvas-renderer.js";

export { CanvasRenderer, type ImageMap } from "./canvas-renderer.js";

export interface PlayOptions {
  scene?: string;
  seed?: number;
  /** Replace the default Canvas 2D renderer (e.g. with a WebGL renderer plugin). */
  renderer?: (canvas: HTMLCanvasElement, images: ImageMap) => Renderer;
  /** Focus the player so keyboard input works immediately. */
  autofocus?: boolean;
}

export interface Player {
  readonly runtime: Runtime;
  readonly canvas: HTMLCanvasElement;
  pause(): void;
  resume(): void;
  /** Stop the loop, release input and dispose the runtime. */
  destroy(): void;
}

/** Project root URL for `src`: a project directory URL or a moonstage.json URL. */
export function projectUrl(src: string | URL, base: string = document.baseURI): URL {
  const root = new URL(src, base);
  if (root.pathname.endsWith(".json")) return new URL(".", root);
  return root.pathname.endsWith("/") ? root : new URL(`${root.pathname}/`, root);
}

/** Fetch-backed project IO. `src` is a project directory URL or a moonstage.json URL. */
export function fetchIO(src: string | URL, base: string = document.baseURI): ProjectIO {
  const root = projectUrl(src, base);
  const get = async (path: string) => {
    const res = await fetch(new URL(path, root));
    return res.ok ? res : undefined;
  };
  return {
    readText: async (path) => (await get(path))?.text(),
    readBytes: async (path) => (await get(path))?.arrayBuffer(),
    importModule: (specifier) =>
      import(/* @vite-ignore */ specifier.startsWith(".") || specifier.startsWith("/") ? new URL(specifier, root).href : specifier),
  };
}

/** Load every image asset the built-in renderer can draw. Missing images become MS1003 diagnostics. */
export async function loadImages(manifest: ProjectManifest, root: URL): Promise<{ images: ImageMap; diagnostics: Diagnostic[] }> {
  const images = new Map<string, HTMLImageElement>();
  const diagnostics: Diagnostic[] = [];
  await Promise.all(
    Object.entries(manifest.assets ?? {})
      .filter(([, asset]) => isImageAsset(asset))
      .map(async ([id, asset]) => {
        const image = new Image();
        image.src = new URL(asset.path, root).href;
        try {
          await image.decode();
          images.set(id, image);
        } catch {
          diagnostics.push(diagnostic("MS1003", `image for asset "${id}" could not be loaded (${asset.path})`, { file: asset.path }));
        }
      }),
  );
  return { images, diagnostics };
}

export class PlayerLoadError extends MoonstageError {
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics);
    this.name = "PlayerLoadError";
  }
}

function showDiagnostics(host: HTMLElement, diagnostics: Diagnostic[]): void {
  const pre = document.createElement("pre");
  pre.style.cssText = "color:#ff8a8a;background:#1a0b10;padding:12px;margin:0;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;height:100%;box-sizing:border-box";
  pre.textContent = diagnostics.map((d) => `${d.code} ${d.file ?? ""} ${d.path ?? ""}\n  ${d.message}${d.hint ? `\n  hint: ${d.hint}` : ""}`).join("\n\n");
  host.replaceChildren(pre);
}

export async function play(target: string | HTMLElement, src: string | URL, options: PlayOptions = {}): Promise<Player> {
  const host = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (host === null) throw new Error(`play(): no element matches ${String(target)}`);

  const loaded = await loadProject(fetchIO(src));
  if (loaded.project === undefined) {
    showDiagnostics(host, loaded.diagnostics);
    throw new PlayerLoadError(loaded.diagnostics);
  }
  const { images, diagnostics: imageProblems } = await loadImages(loaded.project.manifest, projectUrl(src));
  if (imageProblems.length > 0) {
    showDiagnostics(host, imageProblems);
    throw new PlayerLoadError(imageProblems);
  }
  let runtime: Runtime;
  try {
    runtime = await Runtime.create(loaded.project, {
      ...(options.scene !== undefined && { scene: options.scene }),
      ...(options.seed !== undefined && { seed: options.seed }),
    });
  } catch (err) {
    const diagnostics = err instanceof MoonstageError ? err.diagnostics : [];
    if (diagnostics.length > 0) showDiagnostics(host, diagnostics);
    throw err;
  }

  const canvas = document.createElement("canvas");
  const { width = 800, height = 600 } = loaded.project.manifest.display ?? {};
  canvas.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${width}/${height};outline:none`;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", loaded.project.manifest.name);
  host.replaceChildren(canvas);
  const renderer: Renderer = options.renderer?.(canvas, images) ?? new CanvasRenderer(canvas, images);

  const keys = new KeyBindings(loaded.project.manifest, runtime.input);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!keys.handles(e.code)) return;
    e.preventDefault();
    keys.press(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (keys.handles(e.code)) keys.release(e.code);
  };
  const onBlur = () => keys.releaseAll();
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", () => canvas.focus());
  if (options.autofocus) canvas.focus();

  let frameId = 0;
  let last = 0;
  let running = false;
  const loop = (now: number) => {
    // Clamp long pauses (background tabs) so the simulation does not spiral.
    const dt = last === 0 ? 0 : Math.min(0.25, (now - last) / 1000);
    last = now;
    const alpha = runtime.advance(dt);
    renderer.render(runtime.frame(alpha));
    frameId = requestAnimationFrame(loop);
  };
  const resume = () => {
    if (running) return;
    running = true;
    last = 0;
    frameId = requestAnimationFrame(loop);
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(frameId);
    keys.releaseAll();
  };

  runtime.start();
  resume();

  return {
    runtime,
    canvas,
    pause,
    resume,
    destroy() {
      pause();
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("blur", onBlur);
      runtime.stop();
      runtime.dispose();
      renderer.dispose?.();
    },
  };
}
