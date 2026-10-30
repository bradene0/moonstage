# __NAME__ — a Moonstage shooter

- `moonstage.json`: input (`moveX`, `fire`), behavior modules, `bullet` and `enemy` prefabs, two scenes
  (`main`, `over`), and `@moonstage/physics` with zero gravity, used only for sensor collisions.
- `behaviors/`: MoonBit. `ship` moves, fires and loses lives on `hit`; `enemy` checks collisions with
  `@sdk.is_prefab(other, prefab_bullet)`; `spawner` ramps difficulty; `score` keeps a saved best;
  `restart` returns to `main`.

Loop: edit → `moonstage validate --json` → `moonstage test --json` → `moonstage render --tick 120` → `moonstage run`.
Docs ship with the CLI: `moonstage guide build-game`, `moonstage guide moonbit`, `moonstage guide physics`.
Share it as one file: `moonstage build --single-file`.
