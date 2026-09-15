import test from "node:test";
import assert from "node:assert/strict";

import type { BridgeStateStore } from "../state/store.js";
import { formatGlobalRuntimeNotice, RuntimeNoticeBroadcaster } from "./runtime-notice-broadcaster.js";

test("RuntimeNoticeBroadcaster persists failed deliveries per chat binding", async () => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const notices: Array<{ chatId: string; type: string; message: string }> = [];
  const store = {
    listChatBindings: () => [{ chatId: "chat-ok" }, { chatId: "chat-fail" }],
    createRuntimeNotice: (notice: { chatId: string; type: string; message: string }) => {
      notices.push(notice);
    }
  } as unknown as BridgeStateStore;

  const broadcaster = new RuntimeNoticeBroadcaster({
    getStore: () => store,
    getUiLanguage: () => "zh",
    activePack: "telegram",
    safeSendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
      return chatId !== "chat-fail";
    }
  });

  await broadcaster.broadcast({
    kind: "config_warning",
    summary: "bad config",
    detail: "line 4"
  } as never);

  assert.equal(sent.length, 2);
  assert.match(sent[0]?.text ?? "", /Codex 配置警告：bad config/u);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.chatId, "chat-fail");
  assert.equal(notices[0]?.type, "app_server_notice");
  assert.match(notices[0]?.message ?? "", /line 4/u);
});

test("RuntimeNoticeBroadcaster renders bridge-owned notices in English mode", async () => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const notices: Array<{ chatId: string; type: string; message: string }> = [];
  const store = {
    listChatBindings: () => [{ chatId: "chat-1" }],
    createRuntimeNotice: (notice: { chatId: string; type: string; message: string }) => {
      notices.push(notice);
    }
  } as unknown as BridgeStateStore;

  const broadcaster = new RuntimeNoticeBroadcaster({
    getStore: () => store,
    getUiLanguage: () => "en",
    activePack: "telegram",
    safeSendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
      return true;
    }
  });

  await broadcaster.broadcast({
    kind: "thread_compaction_completed"
  } as never);

  await broadcaster.broadcast({
    kind: "model_rerouted",
    fromModel: "gpt-5",
    toModel: "gpt-5.5",
    reason: "availability"
  } as never);

  assert.deepEqual(sent.map((message) => message.text), [
    "Codex thread context compacted.",
    "Codex adjusted the model: gpt-5 -> gpt-5.5 (availability)"
  ]);
  assert.deepEqual(notices, []);
});

test("formatGlobalRuntimeNotice localizes English notice templates", () => {
  assert.equal(
    formatGlobalRuntimeNotice({
      kind: "config_warning",
      summary: "missing setting",
      detail: "set CTB_WEB_LIVE_TOKEN"
    } as never, "en"),
    "Codex configuration warning: missing setting\nset CTB_WEB_LIVE_TOKEN"
  );
  assert.equal(
    formatGlobalRuntimeNotice({
      kind: "deprecation_notice",
      summary: "old field"
    } as never, "en"),
    "Codex deprecation notice: old field"
  );
  assert.equal(
    formatGlobalRuntimeNotice({ kind: "skills_changed" } as never, "en"),
    "Codex skill list refreshed."
  );
});

test("RuntimeNoticeBroadcaster skips notices that do not render a user-facing message", async () => {
  const sent: string[] = [];
  const notices: Array<{ chatId: string; type: string; message: string }> = [];
  const store = {
    listChatBindings: () => [{ chatId: "chat-1" }],
    createRuntimeNotice: (notice: { chatId: string; type: string; message: string }) => {
      notices.push(notice);
    }
  } as unknown as BridgeStateStore;

  const broadcaster = new RuntimeNoticeBroadcaster({
    getStore: () => store,
    getUiLanguage: () => "zh",
    activePack: "telegram",
    safeSendMessage: async (_chatId, text) => {
      sent.push(text);
      return true;
    }
  });

  await broadcaster.broadcast({
    kind: "model_rerouted",
    fromModel: null,
    toModel: "gpt-5",
    reason: "policy"
  } as never);

  assert.deepEqual(sent, []);
  assert.deepEqual(notices, []);
});
