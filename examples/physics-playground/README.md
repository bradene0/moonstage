# Physics Playground

Balls tumble down ledges. Drive the cart to push them into the bucket.

```bash
node packages/cli/dist/main.js run examples/physics-playground   # ← → drive, ↑ / Space jump
node packages/cli/dist/main.js test examples/physics-playground
```

What it exercises:

- **The physics contract** ([docs/physics.md](../../docs/physics.md)): `physicsBody` / `collider` components,
  `physics.gravity`, simulated by `@moonstage/physics` (a MoonBit engine): balls roll down tilted ledges,
  and boxes tumble off them. `plugins/arcade-physics.js` is a small JavaScript provider kept as an example.
- **Velocity through state**: the cart behavior writes `vx` / `vy`, and the provider applies them and
  writes the real velocity back.
- **Collision events and sensors**: each ball checks whether it touched the bucket (a sensor, held as a ref)
  and reports `caught`. The bucket counts `caught` events, so the cart can drive through it unharmed.
- **Spawning**: the dropper spawns `ball` prefabs with physics components.
- **Tests**: resting contact, sensor catching, driving and jumping, and a long dropper run.
