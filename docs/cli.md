# CLI

`moonstage <command> [dir] [options]`. If `dir` is omitted, the current directory is used.

| Command | Purpose |
| --- | --- |
| `describe` | Versions, commands, components, behavior ABI, plugin capabilities, exit codes and every diagnostic code |
| `new <dir> [--name]` | Create a project from the `minimal` template |
| `validate` | Schemas, cross-references, plugins and test files. Missing builds are warnings. |
| `inspect` | Structured summary of scenes, entities, behaviors (built or not), plugins and tests |
| `build [--out dist] [--no-bundle]` | Compile MoonBit behaviors, then write a static web bundle |
| `run` | Build and serve on http://localhost:5173 (`--port`) |
| `run --headless [--ticks 600] [--seed] [--scene] [--input '{"thrust":1}']` | Simulate and report events, logs and a state snapshot |
| `test [--filter]` | Run `tests/*.test.json` |
| `render [--tick 0] [--output file.svg \| -]` | Simulate to a tick and write that frame as SVG |
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

## Programmatic use

`import { validate, test, render } from "moonstage"`. Each function returns the same structured result as
the JSON output. A future MCP server is meant to be a thin adapter over these functions.
