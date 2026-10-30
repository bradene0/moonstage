/**
 * <moonstage-player src="./my-game/"></moonstage-player>
 *
 * Importing this module registers the element. Attributes:
 *   src        project directory or moonstage.json URL (required)
 *   scene      scene id (default: the project's entryScene)
 *   seed       random seed
 *   autofocus  focus the player on load so the keyboard works immediately
 */

import { play, type Player } from "./index.js";

export class MoonstagePlayerElement extends HTMLElement {
  static readonly observedAttributes = ["src", "scene", "seed"];
  private player: Player | undefined;
  private generation = 0;
  private connected = false;

  /** The running player, once loaded. */
  get game(): Player | undefined {
    return this.player;
  }

  connectedCallback(): void {
    if (!this.style.display) this.style.display = "block";
    this.connected = true;
    void this.load();
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.generation++;
    this.player?.destroy();
    this.player = undefined;
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    // Initial attributes are handled by connectedCallback.
    if (this.connected && oldValue !== newValue) void this.load();
  }

  private async load(): Promise<void> {
    const src = this.getAttribute("src");
    if (src === null) return;
    const generation = ++this.generation;
    this.player?.destroy();
    this.player = undefined;
    const seed = this.getAttribute("seed");
    const scene = this.getAttribute("scene");
    // Load into a detached container so a stale load can never replace a newer one.
    const container = document.createElement("div");
    try {
      const player = await play(container, src, {
        ...(scene !== null && { scene }),
        ...(seed !== null && { seed: Number(seed) }),
      });
      if (generation !== this.generation) {
        player.destroy();
        return;
      }
      this.replaceChildren(container);
      if (this.hasAttribute("autofocus")) player.canvas.focus();
      this.player = player;
      this.dispatchEvent(new CustomEvent("moonstage-ready", { detail: player }));
    } catch (error) {
      if (generation !== this.generation) return;
      this.replaceChildren(container);
      this.dispatchEvent(new CustomEvent("moonstage-error", { detail: error }));
      console.error(error);
    }
  }
}

if (!customElements.get("moonstage-player")) {
  customElements.define("moonstage-player", MoonstagePlayerElement);
}
