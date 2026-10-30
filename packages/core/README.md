# @moonstage/core

The core runtime of [Moonstage](https://github.com/bradene0/moonstage), a lightweight, browser-first runtime
for games and interactive media built on MoonBit and WebAssembly.

It provides the project model and JSON Schemas, validation with stable diagnostic codes, entities and transforms,
a fixed-timestep runtime, the WebAssembly behavior host (Behavior ABI 2), the plugin host (Plugin API 2),
render frames and a headless test runner. It has no dependencies and uses neither the DOM nor Node.

Most users want the [`moonstage`](https://www.npmjs.com/package/moonstage) CLI or
[`@moonstage/player`](https://www.npmjs.com/package/@moonstage/player) instead. Plugin authors import types
such as `MoonstagePlugin` and `definePlugin` from here.

**Status:** early development. Contracts may change.
