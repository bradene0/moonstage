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
- **`.msp` package details.** ZIP-compatible is the current direction. The manifest layout, signing
  and streaming are open.
- **Telemetry.** There is none, and none should be added without an explicit decision.
- **Accounts and cloud services.** There are none, and nothing should require them.
- **Licensing beyond the current MIT license**, including any commercial arrangements.
- **Branding** beyond the name "Moonstage".
- **First-party integrations.** Rive is the expected single advanced reference plugin, after the plugin
  contract has proven itself. No other first-party integrations are planned.

## Technical questions to revisit with evidence

- Multiple behaviors per entity. Today there is one, for simplicity.
- Host-provided math (sin, cos, sqrt) in the ABI. MoonBit's pure-WebAssembly `sin` adds about 15 KB per module.
- Entity spawning and removal from behaviors (`scene.spawn` / `scene.remove`).
- Renderer plugins chosen by the project, and image and sprite assets.
- Pinning the MoonBit toolchain version in CI.
