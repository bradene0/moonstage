# Plugins (plugin API level 3)

Plugins extend Moonstage without changing core. A plugin can be a runtime system, a renderer, an asset
loader, a physics provider or an integration with an external media runtime. Plugin API level 3 is an early
contract and may change. The runtime accepts plugins targeting levels 1 to 3: level 2 added spawning, removal
and entity lifecycle hooks; level 3 added `load()`, `provides`, component/handle/parent reads, project
settings and events with a source entity.

## Shape

A plugin is a plain object, usually the default export of an ES module:

```js
/** @type {import("@moonstage/core").MoonstagePlugin<{ defaultSpeed?: number }>} */
export default {
  name: "spin",                 // also the extension namespace
  version: "0.0.0",
  pluginApi: 3,                 // the API level this plugin targets
  capabilities: ["world.read", "world.write"],
  configSchema: { type: "object", properties: { defaultSpeed: { type: "number" } } },
  extensionSchema: { type: "object", properties: { speed: { type: "number" } } },
  create(ctx, config) {
    let ids = [];
    return {
      start() { ids = ctx.world.withExtension(); },
      update(dt) {
        for (const id of ids) {
          const speed = ctx.world.extension(id)?.speed ?? config.defaultSpeed ?? 1;
          ctx.world.setTransform(id, { rotation: ctx.world.transform(id).rotation + speed * dt });
        }
      },
      stop() { ids = []; },
      dispose() {},
    };
  },
};
```

In TypeScript, wrap the object in `definePlugin({...})` from `@moonstage/core` to get type checking.

The full working example is `examples/moon-hopper/plugins/spin.js`. To start a new plugin package, run
`moonstage plugin new` (see below).

## Lifecycle

With API 3, an optional async `load()` is awaited once per runtime before `create()`, for example to
initialize a WebAssembly engine. A plugin can also declare `provides` (e.g. `["physics"]`) so validation
knows which services the project has. Physics providers follow [physics.md](physics.md).

`create(ctx, config)` runs when a runtime is created. Then `start()` runs once, `update(dt)` runs on every
fixed tick after behaviors, `stop()` runs when play stops, and `dispose()` releases resources. With API 2,
`entityAdded(id)` runs for each spawned entity at the end of its spawn tick, and `entityRemoved(id)` runs for
each removed entity, descendants included. When the scene switches, plugins get `stop()`, `entityRemoved` for
every entity of the old scene, and then `start()` in the new one. Every hook is optional.

## Capabilities

| Capability | Grants |
| --- | --- |
| `world.read` | `ctx.world.entities()`, `withExtension()`, `extension(id)`, `transform(id)`, `state(id, name)`, `active(id)`, and with API 3 `component(id, name)`, `handle(id)`, `parent(id)` |
| `world.write` | `ctx.world.setTransform(id, patch)`, `setState(id, name, value)`, `setActive(id, bool)`, `spawn(prefab)` (returns the id), `remove(id)`, and with API 3 `loadScene(id)` |
| `events` | `ctx.events.on(name, listener)` (returns an unsubscribe function), `ctx.events.emit(name, value, source?)` (API 3: `source` is an entity id) |
| `input.read` | `ctx.input.get(name)` |
| `audio` | API 3: `ctx.audio.play(asset, volume)` |

`ctx.time` (`tick`, `elapsed`, `dt`), `ctx.random()` (seeded, API 2) and `ctx.project` (`name`, `display`,
`simulation`, `physics`; API 3) and `ctx.scene` (the current scene id; API 3) are always available. Use
`ctx.random()` instead of `Math.random()` so runs stay reproducible. Calling a method whose capability was not declared
throws `MS4003`.

## Using a plugin in a project

```json
"plugins": {
  "spin": { "module": "./plugins/spin.js", "config": { "defaultSpeed": 0.5 } }
}
```

Each entity carries plugin data under its namespace:

```json
{ "id": "ring", "extensions": { "spin": { "speed": 0.3 } } }
```

`module` is either a project-relative path (`./…`) or a package specifier. The registration key must equal
the plugin's `name`. When the project loads, core validates `config` against `configSchema` and every
`extensions.<name>` object against `extensionSchema` (`MS4004`). It also checks `pluginApi` (`MS4002`).

## Rules

- Do not import Moonstage internals. Use only the context and the types from `@moonstage/core`.
- Keep third-party types out of project files. Put configuration under your namespace.
- Clean up everything in `stop()` and `dispose()`, because runtimes can be created and destroyed repeatedly.
- Renderers implement `Renderer` (`render(frame: RenderFrame)`) and are passed to
  `play(target, src, { renderer })`.

## Creating and checking a plugin

```bash
moonstage plugin new moonstage-plugin-bobber --name bobber
cd moonstage-plugin-bobber
moonstage plugin check .        # conformance suite; add --json for structured results
npm install && npm test         # the same suite through node:test
```

The template is a small working plugin: a package with `index.js`, a conformance test, a README and an
`AGENTS.md`. Its module exports the plugin as default and a `conformance` fixture holding sample config and
extension data.

`moonstage plugin check <file-or-package-dir>` runs these checks:

| Check | Passes when |
| --- | --- |
| `definition` | Metadata, plugin API level and capabilities are valid. |
| `schemas` | `configSchema` and `extensionSchema` accept the fixture's sample data. |
| `capabilities` | The plugin uses only the capabilities it declared. |
| `lifecycle` | create, start, update, stop and dispose run without errors, including while an entity carrying the plugin's extension is spawned and then removed. |
| `reload` | Loading the scene a second time works and produces identical state. A failure usually means module-level state or `Math.random()`. |

Failures are diagnostics with stable codes (`MS4006`, or the underlying code such as `MS4003`), and the
exit code is 1. From JavaScript, call `checkPluginConformance(plugin, fixture)` from `@moonstage/core`.
