/**
 * Programmatic API of the Moonstage CLI. Every command is available as a
 * function returning a structured CommandResult, so other tools (a future
 * MCP server, editors, scripts) can call them without spawning a process.
 */

export {
  COMMANDS,
  CLI_VERSION,
  describe,
  create,
  validate,
  inspect,
  build,
  runCommand as run,
  test,
  render,
  schemas,
  type CommandSpec,
} from "./commands.js";
export { EXIT, formatDiagnostic, type CommandResult, type ExitCode } from "./output.js";
export { fileIO } from "./project-io.js";
export { buildMoonbitBehaviors, findMoon, findMoonbitSdk } from "./moonbit.js";
export { renderSvg } from "./svg.js";
export { writeBundle, serve } from "./bundle.js";
