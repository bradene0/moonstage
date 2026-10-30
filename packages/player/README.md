# @moonstage/player

Plays [Moonstage](https://github.com/bradene0/moonstage) projects in the browser. It includes a Canvas 2D
renderer and keyboard input, and has no framework dependency.

```js
import "@moonstage/player/element";
// <moonstage-player src="./my-game/" autofocus></moonstage-player>
```

```js
import { play } from "@moonstage/player";
const game = await play("#game", "./my-game/");
```

`moonstage build` produces a ready-to-host static bundle that uses this package.

**Status:** early development. Contracts may change.
