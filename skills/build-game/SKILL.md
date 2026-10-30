---
name: build-game
description: Turn a game or interactive-experience request into a working Moonstage project, verified headlessly.
---

# Build a game with Moonstage

Work in small verified steps. Never hand off a project that you have not validated and tested.

1. **Capabilities**: `moonstage describe --json`. Note `components`, `behaviorAbi.imports` and
   `plugin.capabilities`. Built-in rendering covers `shape` (rect/circle/polygon), `text` and `sprite`
   (images and sprite sheets declared under `assets`). For physics, add `physicsBody` / `collider` /
   `joint` components and a provider plugin (copy `examples/physics-playground/plugins/arcade-physics.js`),
   and drive bodies through state `vx` / `vy` (see `docs/physics.md`). Anything else (3D, advanced audio)
   needs a plugin: see [author-plugin](../author-plugin/SKILL.md).
2. **Project**: if none exists, follow [create-project](../create-project/SKILL.md). Then run
   `moonstage inspect --json` to see the current state.
3. **Design the data first**:
   - Inputs: name them in `moonstage.json` `input.axes` or `input.buttons`.
   - Entities: give each a stable `id` and `components` in `scenes/*.scene.json`. For changes to an
     existing scene, prefer `moonstage edit --op '<json>' --json`: it validates before writing. Use `parent` for rigs
     (for example a flame attached to a ship) and the scene `camera` for scrolling.
   - Behaviors: declare each module in `moonstage.json` `behaviors` with ordered `params`, `state`,
     `refs`, `inputs` and `events`.
4. **Write behaviors** in `behaviors/<name>/<name>.mbt`. Copy `moon.pkg` from an existing behavior.
   - Refer to slots by their generated names (`param_speed`, `state_vx`, `ref_target`, `input_jump`,
     `event_hit`). The build writes them to `slots.generated.mbt` from the manifest. Never hard-code slot numbers.
   - Export `ms_abi_version`, `ms_start`, `ms_update` and `ms_event`. Name the first parameter `entity`
     (`self` is reserved).
   - Keep per-entity data in `state`. Communicate between entities with `refs` and `events`.
   - Compose: `"behavior"` can be a list of small behaviors that share state.
   - Spawn bullets, particles and enemies from `prefabs` with `@sdk.spawn_at(prefab_x, x, y)`, and clean up
     with `@sdk.remove`. Check `@sdk.exists(handle)` before using a handle kept in state.
   - Use only `@sdk.random()` for randomness.
   - Reference: `docs/behavior-abi.md` and `examples/moon-hopper/behaviors/`.
5. **Validate**: run `moonstage validate --json` and fix every error. Each diagnostic has `file`, `path`
   and `hint`.
6. **Test**: add `tests/<feature>.test.json` for each mechanic, using scripted `input`, `setup`
   operations and assertions on `state.*`, `transform.*`, `active`, events and prefab counts. Run `moonstage test --json`.
7. **Run headless**: `moonstage run --headless --ticks 600 --input '{"thrust":1}' --json`. Check
   `eventCounts`, `snapshot` and `diagnostics` (any `MS3004` is a trap).
8. **Render**: `moonstage render --tick 120 --output frame.svg`. Look at the frame to check layout,
   camera and visibility.
9. **Iterate** on failures: see [debug-project](../debug-project/SKILL.md). When everything passes,
   `moonstage run` lets a human play.

The reference implementation of all of this is `examples/moon-hopper/`.
