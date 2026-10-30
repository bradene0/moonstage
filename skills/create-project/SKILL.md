---
name: create-project
description: Create a new Moonstage project and confirm it validates, builds and passes its tests.
---

# Create a Moonstage project

0. `moonstage guide` lists every skill and reference doc bundled with the CLI.
1. `moonstage describe --json`: confirm the CLI works and check `toolchain.moon`. If it is null, install
   MoonBit (https://www.moonbitlang.com/download) or set `MOONSTAGE_MOON`.
2. `moonstage new <dir> --template <minimal|platformer|shooter> --name "<Title>" --json`. Pick the closest
   starting point: `platformer` (physics, jumping, coins, camera) and `shooter` (firing, enemies, lives,
   game over) are complete small games with MoonBit behaviors and tests; `minimal` is one moving square.
   Starting from a template is much faster than starting blank.
3. `cd <dir>`
4. `moonstage check --json`: validates, compiles behaviors, runs `tests/*.test.json`, simulates 600 ticks
   and renders the last frame to `.moonstage/render/`. Expect `ok: true` and `testsFailed: 0`; read the SVG
   in `render` to see the scene.
5. `moonstage run`: serves the game at http://localhost:5173 for a human to play.

Next: [build-game](../build-game/SKILL.md). The format reference is `docs/project-format.md`.
