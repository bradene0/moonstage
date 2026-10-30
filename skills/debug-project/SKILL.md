---
name: debug-project
description: Diagnose and fix a failing Moonstage project using structured diagnostics.
---

# Debug a project

Always use `--json`, and branch on `code` and the exit code, never on message text.

1. `moonstage validate --json`, then fix errors in order. `file` + `path` locate the problem, and `hint` gives the fix.
   - `MS1001`/`MS1002`: shape or syntax. Compare with `moonstage schemas`.
   - `MS2001`–`MS2012`: references. Check ids, the manifest `behaviors` interface and the input map.
   - `MS4xxx`: plugin path, name, API level or extension data.
2. If the exit code is 3, the toolchain is missing (`MS3005`). Install MoonBit or set `MOONSTAGE_MOON`.
3. `moonstage build --no-bundle --json`. `MS3006` reports MoonBit compiler errors with the `.mbt` file
   and line:col in `path`. The `hint` holds the source context.
4. `moonstage test --json`. Each failure is `MS5001` with the test `file`, `expect[i]` and the actual
   value in the message.
5. `moonstage run --headless --ticks <n> --json` shows behavior:
   - `diagnostics` containing `MS3004` means a trap. The message names the module, entity and tick. Common
     causes are a slot index that does not match the manifest order, or a ref of `-1` that was used
     without a check.
   - `logs`: add `@sdk.log(value)` calls to a behavior to trace values.
   - `snapshot.entities.<id>`: transform, state and active at the end.
6. `moonstage render --tick <n>` shows a frame if something is invisible or misplaced. Check `active`,
   `layer`, `space`, the camera position and the parent transforms.
7. Re-run validate and test after every fix.
