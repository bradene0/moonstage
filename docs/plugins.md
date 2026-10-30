# Plugins (plugin API level 2)

Plugins extend Moonstage without changing core. A plugin can be a runtime system, a renderer, an asset
loader or an integration with an external media runtime. Plugin API level 2 is an early contract and may change.
The runtime accepts plugins targeting level 1 or 2; level 2 added spawning, removal and entity lifecycle hooks.

## Shape

A plugin is a plain object, usually the default export of an ES module:

```js
/** @type {import("@moonstage/core").MoonstagePlugin<{ defaultSpeed?: number }>} */
export default {
  name: "spin",                 // also the extension namespace
  version: "0.0.0",
  pluginApi: 2,                 // the API level this plugin targets
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

The full working example is `examples/moon-hopper/plugins/spin.js`.

## Lifecycle

`create(ctx, config)` runs when a runtime is created. Then `start()` runs once, `update(dt)` runs on every
fixed tick after behaviors, `stop()` runs when play stops, and `dispose()` releases resources. With API 2,
`entityAdded(id)` runs for each spawned entity at the end of its spawn tick, and `entityRemoved(id)` runs for
each removed entity, descendants included. Every hook is optional.

## Capabilities

| Capability | Grants |
| --- | --- |
| `world.read` | `ctx.world.entities()`, `withExtension()`, `extension(id)`, `transform(id)`, `state(id, name)`, `active(id)` |
| `world.write` | `ctx.world.setTransform(id, patch)`, `setState(id, name, value)`, `setActive(id, bool)`, `spawn(prefab)` (returns the id), `remove(id)` |
| `events` | `ctx.events.on(name, listener)` (returns an unsubscribe function), `ctx.events.emit(name, value)` |
| `input.read` | `ctx.input.get(name)` |

`ctx.time` (`tick`, `elapsed`, `dt`) is always available. Calling a method whose capability was not declared
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

## Not yet implemented

`moonstage plugin new` (scaffolding) and an automated conformance suite are planned. Until then, copy
`spin.js` and test the plugin with a project test, as in `examples/moon-hopper/tests`.
