# Open decisions

These questions are deliberately left open. They belong to the project owner and must not be settled
silently by implementation work.

- **Governance and ownership.** How decisions are made and who maintains which packages.
- **Plugin registry and discovery.** Whether a registry exists, and if so, how plugins are listed and
  trusted. Today plugins are loaded by module path or package name only.
- **npm publishing.** `moonstage`, `@moonstage/core` and `@moonstage/player` 0.1.0 are published under
  the `moonstage` npm organization. Release cadence and automation are still open.
- **Release and versioning policy.** When packages are published, what compatibility promises are
  made, and how `projectFormat`, `pluginApi` and `behaviorAbi` evolve. Today none of these is stable.
- **`.msp` package details.** Format 1 is a ZIP of runtime files plus `msp.json` (docs/project-format.md).
  Signing, streaming, asset compression choices and a stable layout promise are open.
- **Telemetry.** There is none, and none should be added without an explicit decision.
- **Accounts and cloud services.** There are none, and nothing should require them.
- **Licensing beyond the current MIT license**, including any commercial arrangements.
- **Branding** beyond the name "Moonstage".
- **First-party integrations.** `@moonstage/rive` is the single advanced reference plugin. No other
  first-party integrations are planned.

## Technical questions to revisit with evidence

- A full-engine physics provider (e.g. Rapier). The contract is in docs/physics.md, and a reference provider
  exists. Whether Moonstage ships an engine-backed provider itself, or leaves it to the ecosystem, is open.
- Host-provided math (sin, cos, sqrt) in the ABI. MoonBit's pure-WebAssembly `sin` adds about 15 KB per module.
- Renderer plugins chosen by the project (sprites are built in; WebGL/WebGPU renderers are not).
- Pinning the MoonBit toolchain version in CI.
