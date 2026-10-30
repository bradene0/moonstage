# moonstage

The command-line interface for [Moonstage](https://github.com/bradene0/moonstage), a lightweight,
browser-first runtime for games and interactive media. Projects are plain JSON plus MoonBit behaviors
compiled to WebAssembly.

```bash
npx moonstage new my-game
cd my-game
npx moonstage test      # compile behaviors and run headless tests
npx moonstage run       # play at http://localhost:5173
```

Requirements: Node.js 22 or newer, and the [MoonBit toolchain](https://www.moonbitlang.com/download) for
compiling behaviors.

Commands: `describe`, `new`, `validate`, `inspect`, `build`, `run` (browser or `--headless`), `test`,
`render` (SVG) and `schemas`. Every command accepts `--json`, and exit codes are meaningful:
0 ok, 1 project errors or failed tests, 2 usage, 3 missing toolchain, 4 internal.

**Status:** early development. Contracts may change.
