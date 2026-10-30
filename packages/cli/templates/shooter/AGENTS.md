# __NAME__ — a Moonstage shooter

- `moonstage.json`: input (`moveX`, `fire`), behavior modules, `bullet` and `enemy` prefabs, two scenes
  (`main`, `over`), and `@moonstage/physics` with zero gravity, used only for sensor collisions.
- `behaviors/`: MoonBit. `ship` moves, fires and loses lives on `hit`; `enemy` checks collisions with
  `@sdk.is_prefab(other, prefab_bullet)`; `spawner` ramps difficulty; `score` keeps a saved best;
  `restart` returns to `main`.

Loop: edit → `moonstage check --json` (validates, compiles, runs tests, simulates and renders the last frame
to `.moonstage/render/`) → `moonstage run` to play (live reload; F8 saves a recording as a test). Dig into one problem with
`run --headless --test <file>`, `render` or `record` (an animated SVG of a run).
Docs ship with the CLI: `moonstage guide build-game`, `moonstage guide moonbit`, `moonstage guide physics`.
Share it as one file: `moonstage build --single-file`.

This file describes the template you started from. When you change the game, update the description above
(what the game is, its modules, scenes and inputs) so the next agent reads what the project is now.
