# __NAME__ — a Moonstage platformer

- `moonstage.json`: input (`move`, `jump`), physics gravity, behavior modules, the `@moonstage/physics` plugin.
- `scenes/main.scene.json`: ground and platforms (static colliders), coins (sensors), the player (a dynamic
  body), a following camera and the HUD.
- `behaviors/`: MoonBit. `player` steers the body through physics state `vx`/`vy`; `coin` reacts to
  `collision` events; `score` keeps a saved best; `camera` follows.

Loop: edit → `moonstage check --json` (validates, compiles, runs tests, simulates and renders the last frame
to `.moonstage/render/`) → `moonstage run` to play (live reload; F8 saves a recording as a test). Dig into one problem with
`run --headless --test <file>`, `render` or `record` (an animated SVG of a run).
Docs ship with the CLI: `moonstage guide build-game`, `moonstage guide moonbit`, `moonstage guide physics`.
Share it as one file: `moonstage build --single-file`.

This file describes the template you started from. When you change the game, update the description above
(what the game is, its modules, scenes and inputs) so the next agent reads what the project is now.
