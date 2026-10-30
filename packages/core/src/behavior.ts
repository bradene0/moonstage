/**
 * Behavior host: implements Moonstage Behavior ABI 2 (and accepts ABI 1 modules;
 * ABI 2 only adds imports).
 *
 * A behavior is a WebAssembly module that imports functions from the
 * "moonstage" namespace and exports four lifecycle functions. Only numbers
 * (i32 handles/slots, f64 values) cross the boundary, so any language that
 * compiles to WebAssembly can implement a behavior. MoonBit is first-party.
 *
 * Names never cross the ABI. Each module declares its params, state, refs,
 * inputs and events in moonstage.json; a "slot" is the index of a name in the
 * corresponding list. See docs/behavior-abi.md for the full contract.
 */

import { diagnostic, MoonstageError } from "./diagnostics.js";
import type { BehaviorModuleDecl } from "./project.js";
import { BEHAVIOR_ABI, MIN_BEHAVIOR_ABI } from "./versions.js";

export interface BehaviorExports {
  ms_abi_version(): number;
  ms_start(self: number): void;
  ms_update(self: number, dt: number): void;
  ms_event(self: number, event: number, source: number, value: number): void;
}

export const REQUIRED_EXPORTS = ["ms_abi_version", "ms_start", "ms_update", "ms_event"] as const;

/** Functions a behavior may import from the "moonstage" namespace. */
export interface HostFunctions {
  transform_get(entity: number, field: number): number;
  transform_set(entity: number, field: number, value: number): void;
  state_get(entity: number, slot: number): number;
  state_set(entity: number, slot: number, value: number): void;
  param(slot: number): number;
  ref(slot: number): number;
  input(slot: number): number;
  emit(event: number, value: number): void;
  random(): number;
  time(): number;
  entity_active(entity: number): number;
  entity_set_active(entity: number, active: number): void;
  log(value: number): void;
  /** ABI 2: spawn prefab `slot`; returns the new entity's handle. */
  spawn(prefab: number): number;
  /** ABI 2: remove an entity and its descendants at the end of the tick. */
  remove(entity: number): void;
  /** ABI 2: 1 if the handle refers to a live entity (not removed or marked for removal). */
  entity_exists(entity: number): number;
}

export const HOST_FUNCTIONS = [
  "transform_get",
  "transform_set",
  "state_get",
  "state_set",
  "param",
  "ref",
  "input",
  "emit",
  "random",
  "time",
  "entity_active",
  "entity_set_active",
  "log",
  "spawn",
  "remove",
  "entity_exists",
] as const satisfies readonly (keyof HostFunctions)[];

export interface BehaviorImports {
  moonstage: HostFunctions;
}

/** Compiled WebAssembly bytes. */
export type BehaviorBinary = Uint8Array | ArrayBuffer;

/**
 * Alternative to a binary: a function that produces behavior exports from the
 * host imports. Used by tests and by future non-WebAssembly behavior providers.
 */
export type BehaviorFactory = (imports: BehaviorImports) => BehaviorExports | Promise<BehaviorExports>;

export type BehaviorSource = BehaviorBinary | BehaviorFactory;

/** The slice of the WebAssembly JS API the host needs. Injected for testability. */
export interface WasmApi {
  instantiate(bytes: BehaviorBinary, imports: object): Promise<{ instance: { exports: Record<string, unknown> } }>;
  validate(bytes: BehaviorBinary): boolean;
}

export function defaultWasmApi(): WasmApi {
  const wasm = (globalThis as { WebAssembly?: WasmApi }).WebAssembly;
  if (wasm === undefined) throw new Error("WebAssembly is not available in this environment");
  return wasm;
}

export async function instantiateBehavior(
  name: string,
  source: BehaviorSource,
  imports: BehaviorImports,
  wasm: WasmApi = defaultWasmApi(),
): Promise<BehaviorExports> {
  let exports: Record<string, unknown>;
  if (typeof source === "function") {
    exports = (await source(imports)) as unknown as Record<string, unknown>;
  } else {
    if (!wasm.validate(source)) {
      throw new MoonstageError([diagnostic("MS3007", `behavior "${name}" is not a valid WebAssembly module`)]);
    }
    exports = (await wasm.instantiate(source, imports)).instance.exports;
  }
  const missing = REQUIRED_EXPORTS.filter((fn) => typeof exports[fn] !== "function");
  if (missing.length > 0) {
    throw new MoonstageError([
      diagnostic("MS3003", `behavior "${name}" does not export ${missing.join(", ")}`),
    ]);
  }
  const typed = exports as unknown as BehaviorExports;
  const abi = typed.ms_abi_version();
  if (!Number.isInteger(abi) || abi < MIN_BEHAVIOR_ABI || abi > BEHAVIOR_ABI) {
    throw new MoonstageError([
      diagnostic(
        "MS3002",
        `behavior "${name}" targets ABI ${abi}; this runtime supports ABI ${MIN_BEHAVIOR_ABI} to ${BEHAVIOR_ABI}`,
      ),
    ]);
  }
  return typed;
}

/** Per-module slot tables derived from its declaration. */
export interface BehaviorInterface {
  params: string[];
  state: string[];
  refs: string[];
  inputs: string[];
  events: string[];
  prefabs: string[];
}

export function behaviorInterface(decl: BehaviorModuleDecl): BehaviorInterface {
  return {
    params: decl.params ?? [],
    state: decl.state ?? [],
    refs: decl.refs ?? [],
    inputs: decl.inputs ?? [],
    events: decl.events ?? [],
    prefabs: decl.prefabs ?? [],
  };
}
