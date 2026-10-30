# __NAME__ — a Moonstage project

Moonstage projects are plain files. Edit them directly, then verify with the CLI.

- `moonstage.json` — manifest: scenes, input map, behavior modules (and their params/state/refs/inputs/events), plugins.
- `scenes/*.scene.json` — entities with stable ids and components (`transform`, `shape`, `text`, `behavior`, `camera`).
- `behaviors/` — a MoonBit module; each behavior is a package compiled to WebAssembly by `moonstage build`.
- `tests/*.test.json` — headless tests: scripted input, ticks, assertions.

Loop: edit → `moonstage validate --json` → `moonstage test --json` → `moonstage render --tick 120` → `moonstage run`.

Behavior slots (param/state/ref/input/event numbers in MoonBit) are indices into the lists declared in
`moonstage.json`. Keep them in the same order.

`moonstage describe --json` lists components, host functions, error codes and exit codes.
