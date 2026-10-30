/**
 * Plays the sound requests the runtime records (Runtime.drainSounds) with the
 * Web Audio API. Core never touches audio; this is the browser's half.
 */

import { isAudioAsset, type ProjectManifest, type SoundRequest } from "@moonstage/core";

export class SoundPlayer {
  private constructor(
    private readonly context: AudioContext | undefined,
    private readonly buffers: ReadonlyMap<string, AudioBuffer>,
  ) {}

  /** Decode every audio asset. Sounds that fail to load are skipped with a warning; they are not fatal. */
  static async load(manifest: ProjectManifest, root: URL): Promise<SoundPlayer> {
    const assets = Object.entries(manifest.assets ?? {}).filter(([, a]) => isAudioAsset(a));
    const AudioContextClass = globalThis.AudioContext as typeof AudioContext | undefined;
    if (assets.length === 0 || AudioContextClass === undefined) return new SoundPlayer(undefined, new Map());
    const context = new AudioContextClass();
    const buffers = new Map<string, AudioBuffer>();
    await Promise.all(
      assets.map(async ([id, asset]) => {
        try {
          const response = await fetch(new URL(asset.path, root));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()));
        } catch (err) {
          console.warn(`moonstage: sound "${id}" (${asset.path}) could not be loaded: ${String(err)}`);
        }
      }),
    );
    return new SoundPlayer(context, buffers);
  }

  /** Browsers start audio suspended until a user gesture; call this from one. */
  unlock(): void {
    if (this.context?.state === "suspended") void this.context.resume();
  }

  play(requests: readonly SoundRequest[]): void {
    const { context } = this;
    if (context === undefined || context.state !== "running") return;
    for (const request of requests) {
      const buffer = this.buffers.get(request.asset);
      if (buffer === undefined) continue;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = request.volume;
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      source.start();
    }
  }

  dispose(): void {
    void this.context?.close();
  }
}
