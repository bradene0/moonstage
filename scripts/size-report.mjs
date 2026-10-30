// Prints the size of each shipped piece (raw and gzip) as a Markdown table so
// regressions are visible. With --budget, exits 1 when a package's gzipped
// size exceeds its budget below.
// Run with `npm run size` after `npm run build` (and `moonstage build` for wasm sizes).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Gzipped budgets in KB. Raise one deliberately, in the same change that
 * needs it, and say why in the commit message.
 */
const BUDGETS = {
  "@moonstage/core": 40,
  "@moonstage/player": 8,
  "moonstage (cli)": 32,
};

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

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const over = [];
console.log("| package | raw | gzip | budget (gzip) | files |");
console.log("| --- | ---: | ---: | ---: | ---: |");
for (const [name, list] of Object.entries(groups)) {
  const buf = Buffer.concat(list.map((f) => readFileSync(f)));
  const gzip = gzipSync(buf).length;
  const budget = BUDGETS[name];
  const status = budget === undefined ? "–" : gzip > budget * 1024 ? `**${budget} KB exceeded**` : `${budget} KB`;
  if (budget !== undefined && gzip > budget * 1024) over.push(name);
  console.log(`| ${name} | ${kb(buf.length)} | ${kb(gzip)} | ${status} | ${list.length} |`);
}
if (process.argv.includes("--budget") && over.length > 0) {
  console.error(`size budget exceeded: ${over.join(", ")}`);
  process.exit(1);
}
