# Project format (format 1)

A project is a folder. All paths are relative to the project root. The canonical JSON Schemas are in
`schemas/`, and `moonstage schemas` prints them. Format 1 is an early contract and may change.

## moonstage.json

```json
{
  "format": 1,
  "name": "moon-hopper",
  "entryScene": "main",
  "scenes": { "main": "scenes/main.scene.json" },
  "display": { "width": 800, "height": 600, "background": "#0b1020" },
  "simulation": { "tickRate": 60, "seed": 7 },
  "input": {
    "axes": { "turn": { "negative": ["ArrowLeft"], "positive": ["ArrowRight"] } },
    "buttons": { "thrust": ["ArrowUp", "Space"] }
  },
  "behaviors": { "lander": { "source": "behaviors/lander", "params": ["thrust"], "state": ["vx", "vy"], "inputs": ["turn", "thrust"] } },
  "plugins": { "spin": { "module": "./plugins/spin.js" } }
}
```

- `input` maps named inputs to `KeyboardEvent.code` values. Behaviors and plugins read inputs only by name.
- `behaviors` declares each module's interface. See [behavior-abi.md](behavior-abi.md).
- `plugins` lists plugins to load. See [plugins.md](plugins.md).
- `assets` is reserved for the asset registry and is not used by the built-in renderers yet.

## Scenes

```json
{
  "format": 1,
  "camera": "camera",
  "entities": [
    { "id": "lander", "components": { "transform": { "position": [800, 900] }, "shape": { "kind": "polygon", "points": [[0,-18],[14,14],[-14,14]] } } },
    { "id": "flame", "parent": "lander", "active": false, "components": { "shape": { "kind": "polygon", "points": [[-6,4],[6,4],[0,24]] } } }
  ]
}
```

An entity has:

- `id`: a stable identifier, unique in the scene. It starts with a letter and may contain letters, digits, `_` or `-`.
- `parent`: optional. The transform is relative to the parent.
- `active`: optional, default `true`. Inactive entities, and their descendants, are neither updated nor rendered.
- `components` and `extensions`.

Entities update and draw in scene order, unless `layer` says otherwise.

### Components

| Component | Fields |
| --- | --- |
| `transform` | `position` [x, y] in pixels (y grows downward), `rotation` in radians (clockwise), `scale` [sx, sy] |
| `shape` | `kind` (`rect` \| `circle` \| `polygon`), `size` (rect), `radius` (circle), `points` (polygon), `fill`, `stroke`, `strokeWidth`, `opacity`, `layer`, `space` (`world` \| `screen`) |
| `text` | `value`, `size`, `fill`, `align`, `opacity`, `layer`, `space`. `{entityId.stateName}` in `value` is replaced with live state. |
| `behavior` | `module`, `params` {name: number}, `refs` {name: entityId}, `state` {name: initial number} |
| `camera` | `zoom`. The scene's `camera` entity is centered in the view. |

`extensions.<plugin>` holds plugin-owned data. The plugin validates it.

## Tests (tests/*.test.json)

```json
{
  "format": 1,
  "name": "touching a crystal scores a point",
  "ticks": 2,
  "seed": 1,
  "setup": [{ "operation": "set_property", "target": "crystal-1", "property": "transform.position", "value": [800, 905] }],
  "input": [{ "tick": 0, "set": { "thrust": 1 } }],
  "expect": [
    { "event": "collected", "count": { "equals": 1 } },
    { "target": "score", "property": "state.points", "gte": 1 },
    { "target": "lander", "property": "transform.position.y", "approx": 900, "tolerance": 2 },
    { "target": "flame", "property": "active", "equals": true },
    { "target": "camera", "exists": true }
  ]
}
```

- `setup` is a list of scene operations applied before loading.
- `input` changes start at the given tick and are held until changed.
- `property` accepts these paths: `transform.position.x` / `.y`, `transform.rotation`, `transform.scale.x` / `.y`,
  `state.<name>` and `active`.
- Comparisons: `equals`, `approx` with `tolerance`, `gt`, `gte`, `lt` and `lte`.

## Operations

These are semantic edits, shared by tests and future tools:

```json
{ "operation": "set_property", "target": "lander", "property": "transform.position.x", "value": 300 }
{ "operation": "add_entity", "entity": { "id": "enemy-1", "components": {} } }
{ "operation": "remove_entity", "target": "enemy-1" }
```

`property` paths are relative to `components`, with `x`/`y` as aliases for vector indices 0/1. The
entity-level fields `parent`, `active` and `name` are addressed directly.

## Build output

| Path | Contents |
| --- | --- |
| `.moonstage/behaviors/<name>.wasm` | Compiled MoonBit behaviors |
| `.moonstage/moon/` | Generated `moon.work` and the MoonBit build cache |
| `dist/` | Static web bundle from `moonstage build` |

All of these are build artifacts, so do not commit them. The exception is
`behaviors/<name>/slots.generated.mbt`, which is generated but committed (see `docs/behavior-abi.md`).
