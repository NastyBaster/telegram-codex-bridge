import assert from "node:assert/strict";
import test from "node:test";
import { t } from "./locale.js";

test("locale copy exposes stable Chinese and English interaction variants", () => {
  assert.equal(t("en", "interaction.approval.commandTitle"), "Codex requests command approval");
  assert.equal(t("zh", "interaction.approval.commandTitle"), "Codex 需要命令批准");
  assert.equal(
    t("en", "interaction.mcp.provide", { header: "Deployment target" }),
    "Provide Deployment target."
  );
  assert.equal(
    t("en", "interaction.detail.directory", { value: "C:\\workspace" }),
    "Directory: C:\\workspace"
  );
});

test("locale interpolation replaces every occurrence of a parameter", () => {
  assert.equal(
    t("en", "interaction.mcp.allowedValues", { values: "staging, production" }),
    "Allowed values: staging, production. Separate multiple values with commas."
  );
});
