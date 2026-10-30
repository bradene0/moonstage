/**
 * Input abstraction. Behaviors and plugins read named inputs (axes in
 * [-1, 1], buttons 0/1) declared in moonstage.json; they never see raw
 * devices. Platforms (the browser player, headless tests) feed values in.
 */

import type { ProjectManifest } from "./project.js";

export class InputState {
  private readonly values = new Map<string, number>();

  get(name: string): number {
    return this.values.get(name) ?? 0;
  }

  set(name: string, value: number): void {
    this.values.set(name, value);
  }

  reset(): void {
    this.values.clear();
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.values);
  }
}

/**
 * Maps key codes (KeyboardEvent.code strings such as "ArrowLeft", "Space")
 * to named inputs using the project's input declaration. Platform-neutral:
 * it only consumes code strings.
 */
export class KeyBindings {
  private readonly down = new Set<string>();

  constructor(
    private readonly manifest: ProjectManifest,
    private readonly input: InputState,
  ) {}

  /** True when the code is bound to any input (callers may prevent default handling). */
  handles(code: string): boolean {
    const { axes = {}, buttons = {} } = this.manifest.input ?? {};
    return (
      Object.values(axes).some((a) => a.negative?.includes(code) || a.positive?.includes(code)) ||
      Object.values(buttons).some((keys) => keys.includes(code))
    );
  }

  press(code: string): void {
    this.down.add(code);
    this.sync();
  }

  release(code: string): void {
    this.down.delete(code);
    this.sync();
  }

  releaseAll(): void {
    this.down.clear();
    this.sync();
  }

  private sync(): void {
    const { axes = {}, buttons = {} } = this.manifest.input ?? {};
    const pressed = (keys: string[] | undefined) => (keys ?? []).some((k) => this.down.has(k));
    for (const [name, axis] of Object.entries(axes)) {
      this.input.set(name, (pressed(axis.positive) ? 1 : 0) - (pressed(axis.negative) ? 1 : 0));
    }
    for (const [name, keys] of Object.entries(buttons)) {
      this.input.set(name, pressed(keys) ? 1 : 0);
    }
  }
}
