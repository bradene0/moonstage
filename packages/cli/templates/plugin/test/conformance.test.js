import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPluginConformance } from "@moonstage/core";
import plugin, { conformance } from "../index.js";

test("__SLUG__ passes the Moonstage plugin conformance suite", async () => {
  const report = await checkPluginConformance(plugin, conformance);
  const failures = report.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.diagnostics.map((d) => d.message).join("; ")}`);
  assert.deepEqual(failures, []);
});
