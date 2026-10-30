// Copies the MoonBit SDK into the CLI package for `npm pack` / `npm publish`
// (run from packages/cli as prepack), or removes the copy again (postpack).
// The copy is never committed; in the monorepo the CLI uses packages/moonbit-sdk directly.
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(repo, "packages", "cli", "moonbit-sdk");
rmSync(target, { recursive: true, force: true });
if (process.argv[2] !== "--clean") {
  cpSync(join(repo, "packages", "moonbit-sdk"), target, {
    recursive: true,
    filter: (src) => !/[\\/](_build|\.mooncakes)([\\/]|$)/.test(src),
  });
}
