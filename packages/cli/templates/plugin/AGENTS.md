# __NAME__ — a Moonstage plugin

- `index.js` default-exports the plugin and exports a `conformance` fixture (sample config and extension data).
- The contract is in https://github.com/bradene0/moonstage/blob/main/docs/plugins.md and in the
  `MoonstagePlugin` / `PluginContext` types of `@moonstage/core`.
- After every change run `npx moonstage plugin check . --json`, and fix every check where `passed` is false.
- Keep state inside `create()`, use `ctx.random()` for randomness, declare the smallest set of capabilities,
  and handle `entityAdded` / `entityRemoved` if you track entities.
