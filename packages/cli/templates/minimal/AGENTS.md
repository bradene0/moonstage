# __NAME__ — a Moonstage project

Moonstage projects are plain files. Edit them directly, then verify with the CLI.

- `moonstage.json` — manifest: scenes, input map, behavior modules (and their params/state/refs/inputs/events), plugins.
- `scenes/*.scene.json` — entities with stable ids and components (`transform`, `shape`, `text`, `behavior`, `camera`).
- `behaviors/` — a MoonBit module; each behavior is a package compiled to WebAssembly by `moonstage build`.
- `tests/*.test.json` — headless tests: scripted input, ticks, assertions.

Loop: edit → `moonstage validate --json` → `moonstage test --json` → `moonstage render --tick 120` → `moonstage run`.

In MoonBit, refer to params, state, refs, inputs and events by their generated names (`param_speed`,
`input_move_x`, ...). `moonstage build` writes them to `behaviors/<name>/slots.generated.mbt` from the
lists in `moonstage.json`. Do not edit that file.

Docs ship with the CLI: `moonstage guide` lists them, `moonstage guide build-game` is the procedure,
`moonstage guide moonbit` is a primer for writing behaviors (read it before your first `.mbt` edit).
`moonstage describe --json` lists components, host functions, error codes and exit codes.
