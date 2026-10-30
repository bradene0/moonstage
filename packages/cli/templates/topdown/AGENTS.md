# __NAME__ — a Moonstage top-down maze

- `moonstage.json`: input (`moveX`, `moveY`, `restart`) and one behavior module, `player`, which queries the
  `gem` tag and keeps a saved best time.
- `scenes/main.scene.json`: the maze is one `tilemap` component (each character of `rows` is a tile; `#` and
  `~` are solid). Gems are entities tagged `gem`; add or remove them freely and the count follows.
- `behaviors/player`: MoonBit. Moves with `@sdk.tile_solid` checks at the box corners, collects with
  `@sdk.nearest_tagged(tag_gem, entity)` and counts what is left with `@sdk.count_tagged(tag_gem)`.

Loop: edit → `moonstage check --json` (validates, compiles, runs tests, simulates and renders the last frame
to `.moonstage/render/`) → `moonstage run` to play (live reload; F8 saves a recording as a test).
Docs ship with the CLI: `moonstage guide build-game`, `moonstage guide moonbit`.
Share it as one file: `moonstage build --single-file`.

This file describes the template you started from. When you change the game, update the description above
(what the game is, its modules, scenes and inputs) so the next agent reads what the project is now.
