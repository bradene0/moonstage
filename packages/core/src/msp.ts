/**
 * .msp packages: the distributable form of a project. An .msp file is a
 * standard ZIP archive (stored or deflated entries) holding the project's
 * runtime files at their usual paths, plus `msp.json` metadata:
 *
 *   msp.json                  { "format": 1, "name": ..., "createdWith": ... }
 *   moonstage.json
 *   scenes/*.scene.json
 *   .moonstage/behaviors/*.wasm
 *   assets/..., plugins/*.js
 *
 * Any ZIP tool can inspect it. This module reads packages with only web
 * platform APIs (DecompressionStream), so it works in browsers and Node.
 */

import type { BehaviorBinary } from "./behavior.js";
import { diagnostic, MoonstageError } from "./diagnostics.js";
import type { ProjectIO } from "./loader.js";

/** Package format version, independent of the project format. */
export const MSP_FORMAT = 1;

export interface MspMetadata {
  format: number;
  name: string;
  createdWith?: string;
}

type Stream = { pipeThrough(t: unknown): Stream };
interface WebStreams {
  DecompressionStream: new (format: string) => unknown;
  Blob: new (parts: unknown[]) => { stream(): Stream };
  Response: new (body: unknown) => { arrayBuffer(): Promise<ArrayBuffer> };
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const web = globalThis as unknown as WebStreams;
  const stream = new web.Blob([data]).stream().pipeThrough(new web.DecompressionStream("deflate-raw"));
  return new Uint8Array(await new web.Response(stream).arrayBuffer());
}

function corrupt(message: string): MoonstageError {
  return new MoonstageError([diagnostic("MS1005", `invalid .msp package: ${message}`)]);
}

/** Read every file entry of a ZIP archive. Directory entries are skipped. */
export async function readZip(input: BehaviorBinary): Promise<Map<string, Uint8Array>> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is in the last 22 + 65535 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw corrupt("not a ZIP archive");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw corrupt("bad central directory");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (view.getUint32(local, true) !== 0x04034b50) throw corrupt(`bad local header for ${name}`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflateRaw(data));
    else throw corrupt(`${name} uses unsupported compression method ${method}`);
  }
  return files;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

declare function btoa(data: string): string;

/**
 * ProjectIO over a package's contents. Plugins packaged as files are
 * imported from data: URLs, so they must be single-file ES modules (bundle
 * any relative imports); package specifiers resolve as usual.
 */
export async function mspIO(input: BehaviorBinary): Promise<ProjectIO & { files: Map<string, Uint8Array>; metadata: MspMetadata }> {
  const files = await readZip(input);
  const text = (path: string) => {
    const bytes = files.get(path.replace(/^\.\//, ""));
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  };
  const meta = text("msp.json");
  if (meta === undefined) throw corrupt("msp.json is missing");
  const metadata = JSON.parse(meta) as MspMetadata;
  if (metadata.format !== MSP_FORMAT) {
    throw new MoonstageError([
      diagnostic("MS1004", `package format ${metadata.format} is not supported; this runtime reads .msp format ${MSP_FORMAT}`),
    ]);
  }
  return {
    files,
    metadata,
    readText: async (path) => text(path),
    readBytes: async (path) => files.get(path.replace(/^\.\//, "")),
    importModule: async (specifier) => {
      if (!specifier.startsWith("./")) return import(specifier);
      const bytes = files.get(specifier.slice(2));
      if (bytes === undefined) throw new Error(`${specifier} is not in the package`);
      return import(`data:text/javascript;base64,${toBase64(bytes)}`);
    },
  };
}
