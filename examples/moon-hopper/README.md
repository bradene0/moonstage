# Moon Hopper

The Moonstage reference project. Fly a small lander around a moon base and collect crystals.

```bash
# from the repository root, after npm install && npm run build
node packages/cli/dist/main.js run examples/moon-hopper      # play: ← → turn, ↑ / Space thrust
node packages/cli/dist/main.js test examples/moon-hopper     # headless tests
```

What it exercises:

- **Four MoonBit behaviors**: `lander` (input, gravity, bounce), `crystal` (pulse animation, proximity check,
  seeded respawn), `score` (event handling) and `camera` (smooth follow, shake on events).
- **Hierarchy**: `flame` is a child of `lander`, and the lander turns it on and off through a ref.
- **Events**: crystals emit `collected`, and both `score` and `camera` receive it.
- **Camera and screen space**: the world is 1600×1200 and the view follows the lander. The HUD is drawn in screen space.
- **Text binding**: `Crystals: {score.points}`.
- **Plugin**: `plugins/spin.js` rotates every entity with `extensions.spin`.
- **Tests**: gravity and landing, thrust, and crystal collection, the last using a `set_property` setup operation.
