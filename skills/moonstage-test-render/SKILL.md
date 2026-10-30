---
name: moonstage-test-render
description: 'Use when proving that a Moonstage game works: write deterministic headless tests, replay F8 recordings from the browser, render frames and record animated SVGs of a run.'
---

# Test and render

## Tests

Create `tests/<name>.test.json` (the schema: `moonstage schemas`):

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
  has a `data-entity` attribute, so you can search the file for entity ids. Sprites also carry `data-frame`.
  Images are embedded, so the file is self-contained; a magenta box with `data-missing-asset` marks an
  image that could not be read.
- Drive the moment you want with an input timeline: `--input-script '[{"tick":0,"set":{"fire":1}}]'`
  (also for `run --headless`).
- `--output -` prints the SVG to stdout. `--json` reports `items`, `entities` and `camera`.
- Render the important moments (start, after the key input, after an event) and check visibility,
  camera framing and HUD text (for example `Crystals: 1`).

## Record and replay

- **From the browser:** `moonstage run` records every session. Press F8 to download it as
  `<project>-recording.test.json`: a test with the same scene, seed, saves and input, which expects what
  happened (final scene, saves and event counts). Put it in `tests/` and it is a regression test; edit
  `expect` to say what *should* have happened and it reproduces a bug.
- **Replay it:** `moonstage run --headless --test tests/x.test.json --json` runs a test's session without its
  assertions and returns the full state; `moonstage run --replay tests/x.test.json` plays it back in the
  browser.
- **Watch a run:** `moonstage record --test tests/x.test.json` (or `--input-script …`) writes an animated SVG
  of the session to `.moonstage/record/`. Open it in a browser to see motion, not just one frame.
