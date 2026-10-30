---
name: moonstage-author-plugin
description: 'Use when a Moonstage project needs functionality core does not provide (a renderer, an integration, a custom system): write and check a plugin without modifying core.'
---

# Author a plugin

1. Decide whether it should be a plugin. It should be, unless every project needs it. Renderers, physics, file
   formats and external runtimes are always plugins.
2. Scaffold: `moonstage plugin new <dir> --name <name> --json`. This creates a package with a working
   plugin (`index.js`), a `conformance` fixture and a conformance test. For a quick project-local plugin,
   copy `index.js` into the project's `plugins/` folder instead. The contract is in `moonstage guide plugins`.
3. Fill in the metadata: `name` (this is also the extension namespace), `version`, `pluginApi: 2`, and
   the smallest `capabilities` list that works (`world.read`, `world.write`, `events`, `input.read`).
4. Write `configSchema` and `extensionSchema` (JSON Schema), and keep the exported `conformance` fixture's
   sample `config` and `extension` valid against them.
5. Implement `create(ctx, config)` and return `{ start, update(dt), entityAdded, entityRemoved, stop, dispose }`.
   - Keep all state inside `create()`, and use `ctx.random()`, never `Math.random()`.
   - If you track entities, add spawned ones in `entityAdded` and drop removed ones in `entityRemoved`.
   - Use only `ctx`. Never import core internals.
6. Run `moonstage plugin check <dir> --json` after every change, and fix every check with `passed: false`.
7. Register the plugin in a project: `"plugins": { "<name>": { "module": "<package or ./path>", "config": {} } }`.
   Mark entities with `"extensions": { "<name>": { ... } }`. Then run `moonstage validate --json` and add a
   project test that asserts the plugin's effect.
8. For a renderer, implement `Renderer.render(frame)` (see `packages/player/src/canvas-renderer.ts`) and
   pass it to `play(target, src, { renderer })`.
