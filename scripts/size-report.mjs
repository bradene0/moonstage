// Prints the size of each shipped piece (raw and gzip) so regressions are visible.
// Run with `npm run size` after `npm run build` (and `moonstage build` for wasm sizes).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const files = (dir, keep) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .map((f) => join(dir, String(f)))
        .filter((f) => statSync(f).isFile() && keep(f))
    : [];
const runtimeJs = (f) => f.endsWith(".js") && !f.endsWith(".test.js");

const groups = {
  "@moonstage/core": files("packages/core/dist", runtimeJs),
  "@moonstage/player": files("packages/player/dist", runtimeJs),
  "moonstage (cli)": files("packages/cli/dist", runtimeJs),
  "moon-hopper behaviors (wasm)": files("examples/moon-hopper/.moonstage/behaviors", (f) => f.endsWith(".wasm")),
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`.padStart(10);
console.log(`${"package".padEnd(30)}${"raw".padStart(10)}${"gzip".padStart(10)}  files`);
for (const [name, list] of Object.entries(groups)) {
  const buf = Buffer.concat(list.map((f) => readFileSync(f)));
  console.log(`${name.padEnd(30)}${kb(buf.length)}${kb(gzipSync(buf).length)}  ${list.length}`);
}
