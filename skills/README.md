# Agent skills

Each skill is the smallest reliable procedure for one task. Read the one that matches the task; it points
to schemas and docs when more detail is needed.

| Skill | Use when |
| --- | --- |
| [create-project](create-project/SKILL.md) | Starting a new Moonstage project |
| [build-game](build-game/SKILL.md) | Turning a request ("a game where…") into a working project |
| [author-plugin](author-plugin/SKILL.md) | Adding functionality that does not belong in core |
| [debug-project](debug-project/SKILL.md) | Something fails: validation, build, tests, runtime traps |
| [test-render](test-render/SKILL.md) | Proving behavior with headless tests and rendered frames |

In this repository, `moonstage` means `node packages/cli/dist/main.js` (run `npm install && npm run build` first).
