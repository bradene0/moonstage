# Agent skills

Each skill is the smallest reliable procedure for one task. Read the one that matches the task; it points
to schemas and docs when more detail is needed.

| Skill | Use when |
| --- | --- |
| [moonstage-create-project](moonstage-create-project/SKILL.md) | Starting a new Moonstage project |
| [moonstage-build-game](moonstage-build-game/SKILL.md) | Turning a request ("a game where…") into a working project |
| [moonstage-author-plugin](moonstage-author-plugin/SKILL.md) | Adding functionality that does not belong in core |
| [moonstage-debug-project](moonstage-debug-project/SKILL.md) | Something fails: validation, build, tests, runtime traps |
| [moonstage-test-render](moonstage-test-render/SKILL.md) | Proving behavior with headless tests and rendered frames |

Install them where your agent looks for skills with `moonstage skills install` (project) or
`moonstage skills install --global`, or add this repository as a Claude Code plugin. They are also bundled
with the CLI: `moonstage guide <topic>` prints one (topics drop the `moonstage-` prefix).

In this repository, `moonstage` means `node packages/cli/dist/main.js` (run `npm install && npm run build` first).
