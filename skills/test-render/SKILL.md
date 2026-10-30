---
name: test-render
description: Write deterministic headless tests and render frames to verify a Moonstage project.
---

# Test and render

## Tests

Create `tests/<name>.test.json` (the schema is `schemas/test.schema.json`):

```json
{
  "format": 1,
  "name": "what the player should observe",
  "ticks": 120,
  "seed": 1,
  "setup": [{ "operation": "set_property", "target": "enemy", "property": "transform.position.x", "value": 50 }],
  "input": [{ "tick": 0, "set": { "jump": 1 } }, { "tick": 10, "set": { "jump": 0 } }],
  "expect": [
    { "target": "player", "property": "transform.position.y", "lt": 400 },
    { "target": "score", "property": "state.points", "equals": 1 },
    { "event": "hit", "count": { "gte": 1 } }
  ]
}
```

- Use `setup` to arrange the situation instead of waiting many ticks for it to happen.
- Prefer `approx` with a `tolerance` for positions. One tick is `1 / tickRate` seconds.
- Results are deterministic for a given `seed` and input. A flaky test is a bug.
- Run `moonstage test --json` (`--filter <text>` runs a subset).

## Render

- `moonstage render --tick 120 --output frame.svg`: an SVG with one element per draw item. Each element
  has a `data-entity` attribute, so you can search the file for entity ids.
- `--output -` prints the SVG to stdout. `--json` reports `items`, `entities` and `camera`.
- Render the important moments (start, after the key input, after an event) and check visibility,
  camera framing and HUD text (for example `Crystals: 1`).
