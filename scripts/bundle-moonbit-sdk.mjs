// Copies files the published CLI needs from elsewhere in the monorepo into
// packages/cli (run from packages/cli as prepack), or removes them again
// (postpack, or --clean). The copies are never committed; in the monorepo the
// CLI reads them from their real locations.
//
//   moonbit-sdk/  <- packages/moonbit-sdk   (compiling behaviors)
//   guide/        <- docs/ and skills/       (`moonstage guide`)
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repo, "packages", "cli");
const copies = [
  [join(repo, "packages", "moonbit-sdk"), join(cli, "moonbit-sdk")],
  [join(repo, "docs"), join(cli, "guide", "docs")],
  [join(repo, "skills"), join(cli, "guide", "skills")],
];
rmSync(join(cli, "moonbit-sdk"), { recursive: true, force: true });
rmSync(join(cli, "guide"), { recursive: true, force: true });
if (process.argv[2] !== "--clean") {
  for (const [from, to] of copies) {
    cpSync(from, to, { recursive: true, filter: (src) => !/[\\/](_build|\.mooncakes)([\\/]|$)/.test(src) });
  }
}
