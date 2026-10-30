// Scores eval outputs. For each `<runs>/<brief>-<condition>` directory (and its
// `-v1` sibling), reports objective checks as Markdown:
//   moonstage: validate, tests (count / passing), headless run problems,
//              single-file build, follow-up edit size
//   freestyle: index.html present and self-contained, follow-up edit size
// Playability in a real browser is checked separately (by hand or a browser
// tool) and recorded in the report.
//
//   node evals/score.mjs <runs-directory>
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const runs = process.argv[2];
if (!runs) {
  console.error("usage: node evals/score.mjs <runs-directory>");
  process.exit(2);
}
const cli = join(import.meta.dirname, "..", "packages", "cli", "dist", "main.js");
const moonstage = (...args) => {
  const r = spawnSync(process.execPath, [cli, ...args, "--json"], { encoding: "utf8", timeout: 300_000 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: false, parseError: r.stdout.slice(0, 200) || r.stderr.slice(0, 200) };
  }
};

/** Files an author edits, ignoring build output. */
function sources(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => !/(^|\/)(\.moonstage|dist|node_modules|_build|\.git)(\/|$)|slots\.generated\.mbt$/.test(f))
    .filter((f) => statSync(join(dir, f)).isFile() && /\.(json|mbt|js|ts|html|css|md|pkg|mod)$|moon\.(pkg|mod)$/.test(f));
}

/** Lines added + removed between two directories (git diff --no-index). */
function editSize(before, after) {
  if (!existsSync(before) || !existsSync(after)) return undefined;
  const r = spawnSync("git", ["diff", "--no-index", "--numstat", "--", before, after], { encoding: "utf8" });
  let added = 0;
  let removed = 0;
  let files = 0;
  for (const line of r.stdout.trim().split("\n").filter(Boolean)) {
    const [a, d, path] = line.split("\t");
    if (/\/(\.moonstage|dist|_build|node_modules)\/|slots\.generated\.mbt|\.wasm$/.test(path)) continue;
    added += Number(a) || 0;
    removed += Number(d) || 0;
    files += 1;
  }
  return { added, removed, files };
}

const rows = [];
// Run directories are named <brief>-<condition>; anything else (agents' scratch folders) is skipped.
for (const name of readdirSync(runs).filter((n) => /^[a-z0-9]+-(moonstage|freestyle)$/.test(n)).sort()) {
  const dir = join(runs, name);
  if (!statSync(dir).isDirectory()) continue;
  const [brief, condition] = name.split("-");
  const row = { brief, condition, files: sources(dir).length, lines: sources(dir).reduce((n, f) => n + readFileSync(join(dir, f), "utf8").split("\n").length, 0) };
  const edit = editSize(`${dir}-v1`, dir);
  row.followUp = edit ? `+${edit.added} −${edit.removed} in ${edit.files} file(s)` : "no v1 copy";
  if (condition === "moonstage") {
    const validate = moonstage("validate", dir);
    row.validate = validate.ok ? `ok (${validate.warnings ?? 0} warnings)` : `FAIL ${validate.diagnostics?.[0]?.code ?? validate.parseError ?? ""}`;
    const test = moonstage("test", dir);
    row.tests = test.passed !== undefined ? `${test.passed}/${test.passed + test.failed}` : "FAIL";
    const run = moonstage("run", dir, "--headless", "--ticks", "600", "--no-build");
    row.headless = run.ok ? `ok, ${run.diagnostics?.length ?? 0} problems` : `FAIL ${run.diagnostics?.[0]?.code ?? ""}`;
    const single = moonstage("build", dir, "--single-file", "--out", join(dir, "dist", "single.html"));
    row.singleFile = single.ok ? `${Math.round(single.bytes / 1024)} KB` : "FAIL";
  } else {
    const html = join(dir, "index.html");
    const text = existsSync(html) ? readFileSync(html, "utf8") : "";
    row.validate = text ? "index.html" : "MISSING";
    row.tests = "none";
    row.headless = "n/a";
    row.singleFile = text ? `${Math.round(Buffer.byteLength(text) / 1024)} KB${/<script[^>]+src=|https?:\/\//.test(text) ? " (external refs!)" : ""}` : "–";
  }
  rows.push(row);
}

console.log("| brief | condition | source files | source lines | validate | tests | headless 600 ticks | shareable file | follow-up edit |");
console.log("| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(`| ${r.brief} | ${r.condition} | ${r.files} | ${r.lines} | ${r.validate} | ${r.tests} | ${r.headless} | ${r.singleFile} | ${r.followUp} |`);
}
