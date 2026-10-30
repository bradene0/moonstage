// Shared fixtures for core tests. (Named *.test.ts so it is never published.)

import type { BehaviorExports, BehaviorFactory, HostFunctions } from "./behavior.js";
import type { ProjectManifest, SceneSource } from "./project.js";
import type { LoadedProject } from "./runtime.js";

export function manifest(extra: Partial<ProjectManifest> = {}): ProjectManifest {
  return { format: 1, name: "fixture", entryScene: "main", scenes: { main: "scenes/main.scene.json" }, ...extra };
}

export function project(scene: SceneSource, extra: Partial<LoadedProject> & { manifest?: ProjectManifest } = {}): LoadedProject {
  return { manifest: manifest(), scenes: { main: scene }, behaviors: {}, plugins: {}, ...extra };
}

/** Build a behavior from JS functions, the same way a WebAssembly module would see the host. */
export function jsBehavior(impl: (host: HostFunctions) => Partial<BehaviorExports>, abi = 1): BehaviorFactory {
  return ({ moonstage }) => ({
    ms_abi_version: () => abi,
    ms_start: () => {},
    ms_update: () => {},
    ms_event: () => {},
    ...impl(moonstage),
  });
}

/** Hand-assembled WebAssembly module exporting the four ABI functions as no-ops (ABI version given). */
export function minimalWasm(abi = 1): Uint8Array {
  const leb = (n: number) => {
    const out: number[] = [];
    do {
      let byte = n & 0x7f;
      n >>= 7;
      if ((n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0)) {
        out.push(byte);
        break;
      }
      out.push(byte | 0x80);
    } while (true);
    return out;
  };
  const section = (id: number, bytes: number[]) => [id, ...leb(bytes.length), ...bytes];
  const str = (s: string) => [s.length, ...[...s].map((c) => c.charCodeAt(0))];
  const I32 = 0x7f;
  const F64 = 0x7c;
  const types = [
    4,
    0x60, 0, 1, I32, // () -> i32
    0x60, 1, I32, 0, // (i32) -> ()
    0x60, 2, I32, F64, 0, // (i32, f64) -> ()
    0x60, 4, I32, I32, I32, F64, 0, // (i32, i32, i32, f64) -> ()
  ];
  const funcs = [4, 0, 1, 2, 3];
  const names = ["ms_abi_version", "ms_start", "ms_update", "ms_event"];
  const exports = [4, ...names.flatMap((n, i) => [...str(n), 0x00, i])];
  const body = (code: number[]) => [code.length + 1, 0, ...code];
  const code = [4, ...body([0x41, ...leb(abi), 0x0b]), ...body([0x0b]), ...body([0x0b]), ...body([0x0b])];
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, types),
    ...section(3, funcs),
    ...section(7, exports),
    ...section(10, code),
  ]);
}
