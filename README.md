# Moonstage

Moonstage is a lightweight, browser-first runtime for games and interactive media. It is built on
[MoonBit](https://www.moonbitlang.com) and WebAssembly. A project is a folder of plain JSON and MoonBit
files. Humans, scripts and software agents can all read it, diff it, validate it and test it, with or without a GUI.

> **Status: early development.** The project format, plugin API and behavior ABI are still being
> designed and may change. Nothing here is stable yet.

## What it looks like

```text
moon-hopper/
├── moonstage.json          manifest: scenes, input map, behavior interfaces, plugins
├── scenes/main.scene.json  entities with stable ids and components
├── behaviors/              MoonBit module; each behavior compiles to a tiny .wasm
├── plugins/spin.js         a project-local plugin
└── tests/*.test.json       headless tests: scripted input + assertions
```

```json
{
  "id": "lander",
  "components": {
    "transform": { "position": [800, 900] },
    "shape": { "kind": "polygon", "points": [[0, -18], [14, 14], [0, 8], [-14, 14]], "fill": "#e8ecff" },
    "behavior": { "module": "lander", "params": { "thrust": 360, "gravity": 120 }, "refs": { "flame": "flame" } }
  }
}
```

```moonbit
///|
pub fn ms_update(entity : Int, dt : Double) -> Unit {
  let vy = @sdk.state(entity, state_vy) + @sdk.param(param_gravity) * dt
  @sdk.set_y(entity, @sdk.y(entity) + vy * dt)
  @sdk.set_state(entity, state_vy, vy)
}
```

## Try it

You need Node.js 22 or newer and the [MoonBit toolchain](https://www.moonbitlang.com/download) (`moon`).

Start a project from npm:

```bash
npx moonstage new my-game
cd my-game
npx moonstage test      # compile behaviors and run headless tests
npx moonstage run       # play at http://localhost:5173
```

Or run the reference game from this repository:

```bash
git clone https://github.com/bradene0/moonstage.git && cd moonstage
npm install
npm run build
node packages/cli/dist/main.js run examples/moon-hopper
```

This opens the reference game at http://localhost:5173. Use ← → to turn and ↑ or Space to thrust.

Without a browser:

```bash
node packages/cli/dist/main.js test examples/moon-hopper             # headless tests
node packages/cli/dist/main.js render examples/moon-hopper --tick 120  # write a frame as SVG
node packages/cli/dist/main.js run examples/moon-hopper --headless --ticks 600 --json
```

Every command accepts `--json`, and the exit codes are meaningful (see `moonstage describe`).

## Playing a project in a page

```html
<script type="importmap">{ "imports": { "@moonstage/core": "./runtime/core/index.js" } }</script>
<script type="module" src="./runtime/player/element.js"></script>
<moonstage-player src="./game/"></moonstage-player>
```

`moonstage build` writes exactly this kind of static bundle to `dist/`. To ship a game as one file, run
`moonstage pack` and point the player at it: `<moonstage-player src="./game.msp">`. You can also play from code:
`import { play } from "@moonstage/player"; play("#game", "./game/")`. The player has no framework
dependency.

## Packages

| Path | Package | What it is |
| --- | --- | --- |
| `packages/core` | `@moonstage/core` | Project model, schemas, validation, world, behavior host (WebAssembly ABI), plugin host, render frames, headless test runner. No dependencies, no DOM, no Node. |
| `packages/player` | `@moonstage/player` | Browser player: Canvas 2D renderer, keyboard input, `<moonstage-player>`. |
| `packages/cli` | `moonstage` | The `moonstage` command. |
| `packages/moonbit-sdk` | `moonstage/sdk` (MoonBit) | MoonBit bindings for the behavior ABI. |
| `schemas/` | | JSON Schemas for project, scene, test and operation files. |
| `examples/moon-hopper` | | Reference project. It is also used as a conformance fixture. |
| `examples/physics-playground` | | Physics through the provider contract, with a reference provider plugin. |

## Documentation

- [AGENTS.md](AGENTS.md): repository map and rules, for coding agents and contributors.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the runtime is put together and why.
- [docs/project-format.md](docs/project-format.md): `moonstage.json`, scenes, components and tests.
- [docs/behavior-abi.md](docs/behavior-abi.md): the WebAssembly behavior contract.
- [docs/plugins.md](docs/plugins.md): writing plugins.
- [docs/physics.md](docs/physics.md): physics components and the provider contract.
- [docs/cli.md](docs/cli.md): commands, JSON output, exit codes and diagnostics.
- [docs/decisions.md](docs/decisions.md): open project decisions.
- [skills/](skills/): task procedures for agents (create a project, build a game, write a plugin, debug, test and render).
- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
