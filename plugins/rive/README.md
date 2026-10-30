# @moonstage/rive

[Rive](https://rive.app) for [Moonstage](https://github.com/bradene0/moonstage): draw Rive artboards as
entities, and drive their state machines from entity state and Moonstage events.

It is Moonstage's first-party reference for an advanced integration and uses only the public plugin API
(level 4). Nothing about Rive appears in Moonstage core or in the project vocabulary outside this plugin's
extension data.

## Use

```bash
npm install @moonstage/rive
```

```json
{
  "assets": { "hero": { "path": "assets/hero.riv" } },
  "plugins": { "@moonstage/rive": { "module": "@moonstage/rive" } }
}
```

On an entity:

```json
"extensions": {
  "@moonstage/rive": {
    "asset": "hero",
    "artboard": "Hero",
    "stateMachine": "Locomotion",
    "size": [160, 160],
    "fit": "contain",
    "inputs": { "speed": "speed", "grounded": "grounded" },
    "triggers": { "jump": "jumped" },
    "layer": 2
  }
}
```

| Field | Meaning |
| --- | --- |
| `asset` | Id of a `.riv` asset (or one with `"type": "rive"`). |
| `artboard` / `stateMachine` | Names. Default: the file's default artboard and its first state machine. |
| `animation` | Linear animation to loop when the artboard has no state machine (default: its first animation). |
| `size`, `fit` | Drawn size in local pixels and how the artboard fits it (default `contain`). |
| `inputs` | State machine input name → entity state name. Number inputs take the value; boolean inputs are true when it is non-zero. Updated every tick. |
| `triggers` | State machine trigger name → Moonstage event name. Fires when that event is emitted by this entity (or by a plugin, with no source). |
| `events` | Rive events reported by the state machine are emitted as Moonstage events with this entity as source (default `true`). Declare them in your behavior's `events` to receive them. |
| `layer`, `opacity`, `space` | Common draw fields. |

So a MoonBit behavior animates a Rive character just by writing state (`@sdk.set_state(entity, state_speed, v)`)
and emitting events (`@sdk.emit(event_jumped, 1.0)`).

Verified in the browser with Rive's public `vehicles.riv` sample: the artboard draws at the entity's
position and size, in layer order, follows parent entities, and its state machine animates.

## Browser and headless

In the browser the plugin loads `@rive-app/canvas-advanced` and draws through Rive's Canvas 2D renderer into
the player's canvas, in draw order with everything else. `moonstage build` bundles the plugin and Rive's
runtime and WebAssembly automatically.

Headless (Node: `moonstage test`, `run --headless`, `render`) the Rive runtime is not loaded. Entities still
exist and the plugin passes the conformance suite, and `moonstage render` shows labelled placeholders.

## License

MIT. The Rive runtime (`@rive-app/canvas-advanced`) is MIT-licensed by Rive.
