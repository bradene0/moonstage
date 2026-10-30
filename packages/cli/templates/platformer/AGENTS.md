# __NAME__ — a Moonstage platformer

- `moonstage.json`: input (`move`, `jump`), physics gravity, behavior modules, the `@moonstage/physics` plugin.
- `scenes/main.scene.json`: ground and platforms (static colliders), coins (sensors), the player (a dynamic
  body), a following camera and the HUD.
- `behaviors/`: MoonBit. `player` steers the body through physics state `vx`/`vy`; `coin` reacts to
  `collision` events; `score` keeps a saved best; `camera` follows.

Loop: edit → `moonstage validate --json` → `moonstage test --json` → `moonstage render --tick 120` → `moonstage run`.
Docs ship with the CLI: `moonstage guide build-game`, `moonstage guide moonbit`, `moonstage guide physics`.
Share it as one file: `moonstage build --single-file`.
