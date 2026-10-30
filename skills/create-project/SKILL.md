---
name: create-project
description: Create a new Moonstage project and confirm it validates, builds and passes its tests.
---

# Create a Moonstage project

0. `moonstage guide` lists every skill and reference doc bundled with the CLI.
1. `moonstage describe --json`: confirm the CLI works and check `toolchain.moon`. If it is null, install
   MoonBit (https://www.moonbitlang.com/download) or set `MOONSTAGE_MOON`.
2. `moonstage new <dir> --name "<Title>" --json`: creates the manifest, a scene, one MoonBit behavior
   (`mover`), a test and `AGENTS.md`.
3. `cd <dir>`
4. `moonstage validate --json`: expect `ok: true`. Warnings `MS3001` (not built yet) are fine.
5. `moonstage test --json`: compiles behaviors and runs `tests/*.test.json`. Expect `failed: 0`.
6. `moonstage render --tick 30`: writes `.moonstage/render/main-30.svg`. Read it to see the scene.
7. `moonstage run`: serves the game at http://localhost:5173 for a human to play.

Next: [build-game](../build-game/SKILL.md). The format reference is `docs/project-format.md`.
