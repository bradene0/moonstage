# moonstage/sdk (MoonBit)

MoonBit bindings for the Moonstage Behavior ABI. Behaviors import this package
and compile to WebAssembly with `moonstage build`, which wires this SDK into
the build automatically through a generated `moon.work`. You do not need to
add it to your `moon.mod` by hand.

```moonbit
///|
pub fn ms_abi_version() -> Int {
  @sdk.abi_version
}

///|
pub fn ms_update(entity : Int, dt : Double) -> Unit {
  @sdk.set_x(entity, @sdk.x(entity) + @sdk.param(0) * dt)
}
```

See [docs/behavior-abi.md](../../docs/behavior-abi.md) for the full contract.
