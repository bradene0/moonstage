---
name: author-plugin
description: Write a Moonstage plugin (runtime system, renderer or integration) without modifying core.
---

# Author a plugin

1. Decide whether it should be a plugin. It should be, unless every project needs it. Renderers, physics, file
   formats and external runtimes are always plugins.
2. Start from `examples/moon-hopper/plugins/spin.js`, which is about 40 lines. The contract is in
   `docs/plugins.md`, and the types are `MoonstagePlugin`, `PluginContext` and `definePlugin` from
   `@moonstage/core`.
3. Fill in the metadata: `name` (this is also the extension namespace), `version`, `pluginApi: 1`, and
   the smallest `capabilities` list that works (`world.read`, `world.write`, `events`, `input.read`).
4. Add `configSchema` and `extensionSchema` (JSON Schema). Core validates config and entity data with
   them before `create` runs (`MS4004`).
5. Implement `create(ctx, config)` and return `{ start, update(dt), stop, dispose }`. Use only `ctx`.
   Never import core internals.
6. Register the plugin in a project: `"plugins": { "<name>": { "module": "./plugins/<file>.js", "config": {} } }`.
   Mark entities with `"extensions": { "<name>": { ... } }`.
7. Verify:
   - `moonstage validate --json`: `MS4001`, `MS4002` or `MS4005` mean load or definition problems.
   - Add a project test that asserts the plugin's effect (for example `transform.rotation` `gt 0`).
     Run `moonstage test --json`.
   - `moonstage run --headless --json`: check the snapshot.
8. For a renderer, implement `Renderer.render(frame)` (see `packages/player/src/canvas-renderer.ts`) and
   pass it to `play(target, src, { renderer })`.
