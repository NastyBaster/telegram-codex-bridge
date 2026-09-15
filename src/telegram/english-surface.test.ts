import assert from "node:assert/strict";
import test from "node:test";

import { normalizeServerRequest } from "../interactions/normalize.js";
import { createInteractionCardView } from "../core/workflow/interaction-workflow.js";
import { buildProjectBrowserDirectoryMessage } from "./ui-browser.js";
import { resolveCommandPanelEntries, buildCommandPanelMessage } from "./ui-commands.js";
import {
  buildInteractionApprovalCard,
  buildRuntimeStatusCard
} from "./ui-runtime.js";

function visiblePayload(rendered: { text: string; replyMarkup?: { inline_keyboard?: Array<Array<{ text: string }>> } }): string {
  return [
    rendered.text,
    ...(rendered.replyMarkup?.inline_keyboard ?? []).flatMap((row) => row.map((button) => button.text))
  ].join("\n");
}

function assertNoBridgeOwnedHan(name: string, rendered: { text: string; replyMarkup?: { inline_keyboard?: Array<Array<{ text: string }>> } }, dynamicValues: string[] = []): void {
  let payload = visiblePayload(rendered);
  for (const value of dynamicValues) {
    payload = payload.replaceAll(value, "");
  }
  assert.doesNotMatch(payload, /\p{Script=Han}/u, `${name} contains bridge-owned Han text: ${payload}`);
}

test("English Telegram surfaces do not leak bridge-owned Han text", () => {
  const commandPanel = buildCommandPanelMessage({
    language: "en",
    commands: resolveCommandPanelEntries(["new", "status"], "en")
  });
  assertNoBridgeOwnedHan("command panel", commandPanel);

  const browser = buildProjectBrowserDirectoryMessage({
    language: "en",
    token: "browse-token",
    projectName: "Demo project",
    relativePathLabel: "src",
    page: 0,
    totalPages: 1,
    entries: [
      { index: 0, name: "app.ts", kind: "file", sizeLabel: "2 KB" },
      { index: 1, name: "tests", kind: "directory", sizeLabel: null }
    ],
    canGoUp: false,
    allowUseCurrentDirectory: true
  });
  assertNoBridgeOwnedHan("file browser", browser, ["Demo project", "src", "app.ts", "tests", "2 KB"]);

  const runtime = {
    text: buildRuntimeStatusCard({
      language: "en",
      sessionName: "demo-session",
      projectName: "Demo project",
      state: "running",
      progressText: "Running tests",
      includeFooter: false
    })
  };
  assertNoBridgeOwnedHan("runtime card", runtime, ["demo-session", "Demo project", "running", "Running tests"]);

  const interaction = normalizeServerRequest("item/commandExecution/requestApproval", {
    threadId: "thread-en",
    turnId: "turn-en",
    itemId: "item-en",
    command: "npm test",
    cwd: "C:\\workspace",
    availableDecisions: ["accept", "decline", "cancel"]
  }, "en");
  assert.ok(interaction);
  const card = createInteractionCardView(
    { interactionId: "interaction-en", state: "pending", responseJson: null, errorReason: null },
    interaction,
    { language: "en" }
  );
  assert.equal(card.kind, "approval");
  assertNoBridgeOwnedHan("approval card", buildInteractionApprovalCard(card), ["npm test", "C:\\workspace"]);
});
