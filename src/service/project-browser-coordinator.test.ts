import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BridgePaths } from "../paths.js";
import { BridgeStateStore } from "../state/store.js";
import { ProjectBrowserCoordinator } from "./project-browser-coordinator.js";

function createTestPaths(root: string): BridgePaths {
  const logsDir = join(root, "logs");
  const runtimeDir = join(root, "runtime");

  return {
    homeDir: root,
    repoRoot: root,
    installRoot: join(root, "install"),
    stateRoot: join(root, "state"),
    configRoot: join(root, "config"),
    logsDir,
    perfLogsDir: join(logsDir, "perf"),
    telegramSessionFlowLogsDir: join(logsDir, "telegram-session-flow"),
    runtimeDir,
    cacheDir: join(root, "cache"),
    dbPath: join(root, "state", "bridge.db"),
    stateStoreFailurePath: join(root, "state", "state-store-open-failure.json"),
    envPath: join(root, "config", "bridge.env"),
    servicePath: join(root, "service", "bridge.service"),
    launchAgentPath: join(root, "LaunchAgents", "bridge.plist"),
    binPath: join(root, "bin", "ctb"),
    manifestPath: join(root, "install", "install-manifest.json"),
    offsetPath: join(runtimeDir, "telegram-offset.json"),
    bridgeLogPath: join(logsDir, "bridge.log"),
    bootstrapLogPath: join(logsDir, "bootstrap.log"),
    appServerLogPath: join(logsDir, "app-server.log"),
    telegramStatusCardLogPath: join(logsDir, "status-card.log"),
    telegramPlanCardLogPath: join(logsDir, "plan-card.log"),
    telegramErrorCardLogPath: join(logsDir, "error-card.log")
  };
}

function getOnlyBrowseToken(coordinator: ProjectBrowserCoordinator): string {
  const [token] = [...((coordinator as unknown as {
    browseStates: Map<string, unknown>;
  }).browseStates.keys())];
  assert.ok(token);
  return token;
}

function authorizeChat(store: BridgeStateStore, chatId: string): void {
  store.upsertPendingAuthorization({
    userId: "user-1",
    chatId,
    username: "tester",
    displayName: "Tester"
  });

  const candidate = store.listPendingAuthorizations()[0];
  assert.ok(candidate);
  store.confirmPendingAuthorization(candidate);
}

async function createCoordinatorContext() {
  const root = await mkdtemp(join(tmpdir(), "ctb-project-browser-test-"));
  const paths = createTestPaths(root);
  await Promise.all([
    mkdir(paths.installRoot, { recursive: true }),
    mkdir(paths.stateRoot, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.configRoot, { recursive: true })
  ]);

  const store = await BridgeStateStore.open(paths, {
    info: async () => {},
    warn: async () => {},
    error: async () => {}
  });

  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const sentHtml: Array<{ chatId: string; messageId: number; html: string; replyMarkup?: unknown }> = [];
  const editedHtml: Array<{ chatId: string; messageId: number; html: string; replyMarkup?: unknown }> = [];
  const sentPhotos: Array<{ chatId: string; photoPath: string; caption?: string; parseMode?: "HTML" }> = [];
  const callbackAnswers: Array<string | undefined> = [];
  const deletedMessages: number[] = [];
  const currentSessionCardCalls: Array<{ chatId: string; reason: string }> = [];
  let nextMessageId = 1000;

  const coordinator = new ProjectBrowserCoordinator({
    getStore: () => store,
    safeSendMessage: async (chatId, text) => {
      sentMessages.push({ chatId, text });
      return true;
    },
    safeSendHtmlMessage: async (chatId, html) => {
      sentHtml.push({ chatId, messageId: nextMessageId++, html });
      return true;
    },
    safeSendHtmlMessageResult: async (chatId, html, replyMarkup) => {
      const messageId = nextMessageId++;
      sentHtml.push(replyMarkup
        ? { chatId, messageId, html, replyMarkup }
        : { chatId, messageId, html });
      return { messageId };
    },
    safeEditHtmlMessageText: async (chatId, messageId, html, replyMarkup) => {
      editedHtml.push(replyMarkup
        ? { chatId, messageId, html, replyMarkup }
        : { chatId, messageId, html });
      return { outcome: "edited" };
    },
    safeDeleteMessage: async (_chatId, messageId) => {
      deletedMessages.push(messageId);
      return { outcome: "deleted" };
    },
    safeAnswerCallbackQuery: async (_callbackQueryId, text) => {
      callbackAnswers.push(text);
    },
    safeSendPhoto: async (chatId, photoPath, options) => {
      sentPhotos.push({
        chatId,
        photoPath,
        ...(options?.caption !== undefined ? { caption: options.caption } : {}),
        ...(options?.parseMode !== undefined ? { parseMode: options.parseMode } : {})
      });
      return true;
    },
    getUiLanguage: () => "zh",
    syncCurrentSessionCard: async (chatId, reason) => {
      currentSessionCardCalls.push({ chatId, reason });
    }
  });

  return {
    root,
    paths,
    store,
    coordinator,
    sentMessages,
    sentHtml,
    editedHtml,
    sentPhotos,
    callbackAnswers,
    deletedMessages,
    currentSessionCardCalls,
    cleanup: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  };
}

test("browse requires an active session", async () => {
  const context = await createCoordinatorContext();
  try {
    await context.coordinator.handleBrowse("chat-1");
    assert.deepEqual(context.sentMessages, [{
      chatId: "chat-1",
      text: "当前没有活动会话，请先发送 /new 或 /use 进入项目。"
    }]);
  } finally {
    await context.cleanup();
  }
});

test("browse opens the current project root and lists directory entries", async () => {
  const context = await createCoordinatorContext();
  try {
    const projectRoot = join(context.root, "project");
    await mkdir(join(projectRoot, "docs"), { recursive: true });
    await writeFile(join(projectRoot, "README.md"), "# hello\n", "utf8");
    authorizeChat(context.store, "chat-1");
    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: projectRoot,
      displayName: "Session One"
    });

    await context.coordinator.handleBrowse("chat-1");

    assert.equal(context.sentHtml.length, 1);
    assert.match(context.sentHtml[0]?.html ?? "", /<b>文件浏览<\/b>/u);
    assert.match(context.sentHtml[0]?.html ?? "", /docs\//u);
    assert.match(context.sentHtml[0]?.html ?? "", /README\.md/u);
    const token = getOnlyBrowseToken(context.coordinator);
    assert.ok(token.length > 0);
  } finally {
    await context.cleanup();
  }
});

test("browse opens text previews and returns to the directory view", async () => {
  const context = await createCoordinatorContext();
  try {
    const projectRoot = join(context.root, "project");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, "index.ts"), "const html = '<tag>';\n", "utf8");
    authorizeChat(context.store, "chat-1");
    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: projectRoot,
      displayName: "Session One"
    });

    await context.coordinator.handleBrowse("chat-1");

    const token = getOnlyBrowseToken(context.coordinator);
    await context.coordinator.handleBrowseCallback("cb-open", "chat-1", 1000, {
      kind: "browse_open",
      token,
      entryIndex: 0
    });

    assert.match(context.editedHtml.at(-1)?.html ?? "", /<b>文件预览<\/b>/u);
    assert.match(context.editedHtml.at(-1)?.html ?? "", /&lt;tag&gt;/u);

    await context.coordinator.handleBrowseCallback("cb-back", "chat-1", 1000, {
      kind: "browse_back",
      token
    });

    assert.match(context.editedHtml.at(-1)?.html ?? "", /<b>文件浏览<\/b>/u);
    assert.match(context.editedHtml.at(-1)?.html ?? "", /index\.ts/u);
  } finally {
    await context.cleanup();
  }
});

test("browse sends image previews and binary metadata without replacing the browser card", async () => {
  const context = await createCoordinatorContext();
  try {
    const projectRoot = join(context.root, "project");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, "diagram.png"), "fake-png", "utf8");
    await writeFile(join(projectRoot, "archive.bin"), Buffer.from([0, 1, 2, 3]));
    authorizeChat(context.store, "chat-1");
    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: projectRoot,
      displayName: "Session One"
    });

    await context.coordinator.handleBrowse("chat-1");
    const token = getOnlyBrowseToken(context.coordinator);

    await context.coordinator.handleBrowseCallback("cb-image", "chat-1", 1000, {
      kind: "browse_open",
      token,
      entryIndex: 1
    });

    assert.equal(context.sentPhotos.length, 1);
    assert.match(context.sentPhotos[0]?.caption ?? "", /<b>图片预览<\/b>/u);
    assert.equal(context.callbackAnswers.at(-1), "已发送图片预览。");
    assert.equal(context.editedHtml.length, 0);

    await context.coordinator.handleBrowseCallback("cb-binary", "chat-1", 1000, {
      kind: "browse_open",
      token,
      entryIndex: 0
    });

    assert.match(context.sentHtml.at(-1)?.html ?? "", /<b>文件信息<\/b>/u);
    assert.match(context.sentHtml.at(-1)?.html ?? "", /二进制或暂不支持预览/u);
    assert.equal(context.editedHtml.length, 0);
  } finally {
    await context.cleanup();
  }
});

test("browse rejects stale tokens after the active session changes and can close the browser message", async () => {
  const context = await createCoordinatorContext();
  try {
    const projectRoot = join(context.root, "project");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, "index.ts"), "const value = 1;\n", "utf8");
    authorizeChat(context.store, "chat-1");
    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: projectRoot,
      displayName: "Session One"
    });

    await context.coordinator.handleBrowse("chat-1");
    const token = getOnlyBrowseToken(context.coordinator);

    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project Two",
      projectPath: join(context.root, "other-project"),
      displayName: "Session Two"
    });

    await context.coordinator.handleBrowseCallback("cb-expired", "chat-1", 1000, {
      kind: "browse_refresh",
      token
    });
    assert.equal(context.callbackAnswers.at(-1), "这个按钮已过期，请重新发送 /browse。");

    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: projectRoot,
      displayName: "Session Three"
    });
    await context.coordinator.handleBrowse("chat-1");
    const secondToken = getOnlyBrowseToken(context.coordinator);
    await context.coordinator.handleBrowseCallback("cb-close", "chat-1", 1001, {
      kind: "browse_close",
      token: secondToken
    });

    assert.deepEqual(context.deletedMessages, [1001]);
  } finally {
    await context.cleanup();
  }
});

test("browse keeps symlink entries non-navigable", async () => {
  const context = await createCoordinatorContext();
  try {
    const projectRoot = join(context.root, "project");
    await mkdir(projectRoot, { recursive: true });
    await mkdir(join(projectRoot, "real-dir"), { recursive: true });
    await symlink(join(projectRoot, "real-dir"), join(projectRoot, "real-link"));
    authorizeChat(context.store, "chat-1");
    context.store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: projectRoot,
      displayName: "Session One"
    });

    await context.coordinator.handleBrowse("chat-1");
    const token = getOnlyBrowseToken(context.coordinator);
    await context.coordinator.handleBrowseCallback("cb-link", "chat-1", 1000, {
      kind: "browse_open",
      token,
      entryIndex: 1
    });

    assert.equal(context.callbackAnswers.at(-1), "Phase 1 暂不支持浏览符号链接。");
  } finally {
    await context.cleanup();
  }
});

test("pre-session browse can create a session from the current directory with confirmation", async () => {
  const context = await createCoordinatorContext();
  try {
    authorizeChat(context.store, "chat-1");
    const rootPath = join(context.root, "workspace");
    await mkdir(rootPath, { recursive: true });
    await mkdir(join(rootPath, "repo-a"), { recursive: true });

    const opened = await context.coordinator.openPreSessionBrowse("chat-1", 77, rootPath);
    assert.equal(opened, true);
    assert.deepEqual(context.deletedMessages, [77]);

    const token = getOnlyBrowseToken(context.coordinator);
    await context.coordinator.handleBrowseCallback("cb-use-current", "chat-1", 1000, {
      kind: "browse_use_current_dir",
      token
    });
    assert.match(context.editedHtml.at(-1)?.html ?? "", /确认新建会话/u);

    await context.coordinator.handleBrowseCallback("cb-confirm-create", "chat-1", 1000, {
      kind: "browse_use_current_dir_confirm",
      token
    });

    assert.equal(
      await realpath(context.store.getActiveSession("chat-1")?.projectPath ?? ""),
      await realpath(rootPath)
    );
    assert.deepEqual(context.deletedMessages, [77, 1000]);
    assert.match(context.sentHtml.at(-1)?.html ?? "", /<b>New session created<\/b>/u);
    assert.deepEqual(context.currentSessionCardCalls, [{ chatId: "chat-1", reason: "session_created" }]);
  } finally {
    await context.cleanup();
  }
});

test("pre-session browse hides dot-prefixed entries", async () => {
  const context = await createCoordinatorContext();
  try {
    authorizeChat(context.store, "chat-1");
    const rootPath = join(context.root, "workspace");
    await mkdir(rootPath, { recursive: true });
    await mkdir(join(rootPath, ".codex"), { recursive: true });
    await mkdir(join(rootPath, "OpenClaw"), { recursive: true });

    const opened = await context.coordinator.openPreSessionBrowse("chat-1", 88, rootPath);
    assert.equal(opened, true);
    const initial = context.sentHtml[0]?.html ?? "";
    assert.match(initial, /OpenClaw/u);
    assert.doesNotMatch(initial, /\.codex/u);
  } finally {
    await context.cleanup();
  }
});
