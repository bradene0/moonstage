# CLI

`moonstage <command> [dir] [options]`. If `dir` is omitted, the current directory is used.

| Command | Purpose |
| --- | --- |
| `describe` | Versions, commands, components, behavior ABI, plugin capabilities, exit codes and every diagnostic code |
| `new <dir> [--name]` | Create a project from the `minimal` template |
| `validate` | Schemas, cross-references, plugins and test files. Missing builds are warnings. |
| `inspect` | Structured summary of scenes, entities, behaviors (built or not), plugins and tests |
| `scene [--scene id]` | Print a scene's source JSON |
| `edit [--scene id] (--op '<json>' \| --ops <file\|->) [--dry-run]` | Apply semantic operations to a scene. The whole project is validated first; nothing is written if there are errors. |
| `mcp` | Serve these operations to agents over the Model Context Protocol (stdio) |
| `build [--out dist] [--no-bundle]` | Compile MoonBit behaviors, then write a static web bundle |
| `run` | Build and serve on http://localhost:5173 (`--port`) |
| `run --headless [--ticks 600] [--seed] [--scene] [--input '{"thrust":1}']` | Simulate and report events, logs and a state snapshot |
| `test [--filter]` | Run `tests/*.test.json` |
| `render [--tick 0] [--output file.svg \| -]` | Simulate to a tick and write that frame as SVG |
| `plugin new <dir> [--name]` | Create a plugin package from the template |
| `plugin check <file-or-dir>` | Run the plugin conformance suite. Exit code 1 if any check fails. |
| `schemas [--write] [--out dir]` | Print or write the JSON Schemas |

`run`, `test` and `render` compile MoonBit behaviors first. Pass `--no-build` to skip this.

## JSON output

With `--json`, stdout contains exactly one JSON object:

```json
{ "ok": true, "command": "validate", "exitCode": 0, "...": "command data", "diagnostics": [] }
```

Each diagnostic looks like this:

```json
{
  "code": "MS2006",
  "severity": "error",
  "message": "param \"thrustt\" is not declared by behavior \"lander\"",
  "file": "scenes/main.scene.json",
  "path": "entities[20].components.behavior.params.thrustt",
  "entity": "lander",
  "component": "behavior",
  "hint": "Entity params must match the names declared in the behavior's `params` list."
}
```

Codes are stable and never reused. Run `moonstage describe --json` to list all of them.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | The project has errors, or tests failed |
| 2 | Usage error (bad arguments, not a project directory) |
| 3 | A required tool is missing (for example, MoonBit) |
| 4 | Internal error (a Moonstage bug) |

## Environment

| Variable | Effect |
| --- | --- |
| `MOONSTAGE_MOON` | Path to the `moon` binary. Default: PATH, then `~/.moon/bin/moon`. |
| `MOONSTAGE_MOONBIT_SDK` | Path to the MoonBit SDK module |

## Editing scenes

`moonstage edit` applies the operations described in [project-format.md](project-format.md#operations), in
order, to one scene (default: the entry scene):

```bash
moonstage edit . --op '{"operation":"set_property","target":"lander","property":"transform.position.x","value":300}'
moonstage edit . --ops changes.json --dry-run --json
```

Prefer it to rewriting scene files: it touches only what the operations name, and it refuses edits that
would leave the project invalid.

## MCP

`moonstage mcp` is a Model Context Protocol server over stdio. Its tools (`moonstage_describe`,
`moonstage_inspect`, `moonstage_get_scene`, `moonstage_edit_scene`, `moonstage_validate`, `moonstage_test`,
`moonstage_run_headless`, `moonstage_render`, `moonstage_build`, `moonstage_new_project`,
`moonstage_plugin_check`, `moonstage_schemas`) call the same functions as the CLI and return the same JSON.
Example client configuration:

```json
{ "mcpServers": { "moonstage": { "command": "npx", "args": ["-y", "moonstage", "mcp"] } } }
```

## Programmatic use

`import { validate, test, render } from "moonstage"`. Each function returns the same structured result as
the JSON output. A future MCP server is meant to be a thin adapter over these functions.
