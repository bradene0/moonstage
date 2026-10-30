# @moonstage/physics

Rigid-body physics for [Moonstage](https://github.com/bradene0/moonstage). The engine is written in
**MoonBit** (`moonbit/engine/engine.mbt`), compiled to WebAssembly, and embedded in this package's single
module, so it works in folder bundles, `.msp` packages and single-file games, in browsers and in Node.

- Circles and **rotating** boxes (polygons collide as their bounding box)
- Contacts with torque, so boxes tumble and circles roll; friction and restitution
- Sensors with `collision` / `collisionEnd` events
- Distance joints, and revolute (pin) joints with motors
- Deterministic; one isolated engine instance per runtime
- About 2 ms per tick for 600 rotating bodies on a laptop (`npm run bench`)

## Use

The Moonstage CLI ships with this plugin, so a project just names it:

```json
"physics": { "gravity": [0, 900] },
"plugins": { "@moonstage/physics": { "module": "@moonstage/physics", "config": { "substeps": 4, "iterations": 8 } } }
```

Then give entities `physicsBody`, `collider` and `joint` components, and drive bodies from behaviors through
state `vx` / `vy` / `av`. The contract is in [docs/physics.md](../../docs/physics.md).

## Build

`npm run build` at the repository root compiles the MoonBit engine (`moon build --target wasm`) and embeds it
into `dist/index.js`.
