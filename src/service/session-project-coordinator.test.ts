import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BridgePaths } from "../paths.js";
import { BridgeStateStore } from "../state/store.js";
import { SessionProjectCoordinator } from "./session-project-coordinator.js";
import type { BridgeConfig } from "../config.js";

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

async function createCoordinatorContext(options?: {
  activePack?: BridgeConfig["activePack"];
}) {
  const root = await mkdtemp(join(tmpdir(), "ctb-session-project-coordinator-test-"));
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
  const reanchorCalls: Array<{ chatId: string; sessionId: string; reason: string }> = [];
  const archiveHookCalls: Array<{ chatId: string; sessionId: string; reason: string }> = [];
  const unarchiveHookCalls: Array<{ chatId: string; sessionId: string; reason: string }> = [];
  const currentSessionCardCalls: Array<{ chatId: string; reason: string }> = [];
  const sentMessages: Array<{
    messageId: number;
    text: string;
    html: boolean;
    replyMarkup?: unknown;
  }> = [];
  const deletedMessages: number[] = [];
  const editedMessages: Array<{ messageId: number; text: string; html: boolean }> = [];
  let nextMessageId = 100;

  const coordinator = new SessionProjectCoordinator({
      logger: { warn: async () => {} },
      paths: { homeDir: root },
      config: { projectScanRoots: [] },
      activePack: options?.activePack ?? "telegram",
      preferBridgeCommandButtons: false,
      getStore: () => store,
      getSnapshot: () => null,
      getUiLanguage: () => "zh",
      ensureAppServerAvailable: async () => {
        throw new Error("not used");
      },
    registerPendingThreadArchiveOp: () => 0,
    markPendingThreadArchiveCommit: async () => {},
    dropPendingThreadArchiveOp: () => {},
    safeSendMessage: async (_chatId, text, replyMarkup) => {
      sentMessages.push({ messageId: nextMessageId, text, html: false, replyMarkup });
      nextMessageId += 1;
      return true;
    },
    safeSendMessageResult: async (_chatId, text, replyMarkup) => {
      const messageId = nextMessageId;
      sentMessages.push({ messageId, text, html: false, replyMarkup });
      nextMessageId += 1;
      return { messageId };
    },
    safeSendHtmlMessage: async (_chatId, text, replyMarkup) => {
      sentMessages.push({ messageId: nextMessageId, text, html: true, replyMarkup });
      nextMessageId += 1;
      return true;
    },
    safeSendHtmlMessageResult: async (_chatId, text, replyMarkup) => {
      const messageId = nextMessageId;
      sentMessages.push({ messageId, text, html: true, replyMarkup });
      nextMessageId += 1;
      return { messageId };
    },
    safeEditMessageText: async (_chatId, messageId, text) => {
      editedMessages.push({ messageId, text, html: false });
      return { outcome: "edited" };
    },
    safeEditHtmlMessageText: async (_chatId, messageId, text) => {
      editedMessages.push({ messageId, text, html: true });
      return { outcome: "edited" };
    },
    safeDeleteMessage: async (_chatId, messageId) => {
      deletedMessages.push(messageId);
      return { outcome: "deleted" };
    },
    getActiveRuntimeStatusText: () => null,
    resolveSessionModelState: async (session) => ({
      configuredModel: session.selectedModel,
      configuredReasoningEffort: session.selectedReasoningEffort,
      effectiveModel: session.selectedModel,
      effectiveReasoningEffort: session.selectedReasoningEffort
    }),
    reanchorRuntimeAfterBridgeReply: async (chatId, sessionId, reason) => {
      reanchorCalls.push({ chatId, sessionId, reason });
    },
    syncCurrentSessionCard: async (chatId, reason) => {
      currentSessionCardCalls.push({ chatId, reason });
    },
    handleSessionArchived: async (chatId, sessionId, reason) => {
      archiveHookCalls.push({ chatId, sessionId, reason });
    },
    handleSessionUnarchived: async (chatId, sessionId, reason) => {
      unarchiveHookCalls.push({ chatId, sessionId, reason });
    },
    openPreSessionBrowse: async () => true
  });

  return {
    coordinator,
    store,
    reanchorCalls,
    archiveHookCalls,
    unarchiveHookCalls,
    currentSessionCardCalls,
    sentMessages,
    deletedMessages,
    editedMessages,
    paths,
    cleanup: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  };
}

function authorizeChat(store: BridgeStateStore, chatId: string): void {
  store.upsertPendingAuthorization({
    userId: "user-1",
    chatId: chatId,
    username: "tester",
    displayName: "Tester"
  });

  const candidate = store.listPendingAuthorizations()[0];
  assert.ok(candidate);
  store.confirmPendingAuthorization(candidate);
}

function authorizeFeishuChat(store: BridgeStateStore, chatId: string, userId = "user-1"): void {
  store.upsertPendingAuthorization({
    platform: "feishu",
    userId,
    chatId,
    username: "tester",
    displayName: "Tester"
  });

  const candidate = store.listPendingAuthorizations({ platform: "feishu" })[0];
  assert.ok(candidate);
  store.confirmPendingAuthorization(candidate);
}

async function createDiscoveredProject(root: string, name: string): Promise<string> {
  const projectPath = join(root, "Repo", name);
  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, ".git"), { recursive: true });
  return projectPath;
}

test("SessionProjectCoordinator leaves runtime hubs in place after project picker creates a new session", async () => {
  const { coordinator, store, reanchorCalls, cleanup } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    (coordinator as any).pickerStates.set("chat-1", {
      picker: {
        projectMap: new Map([["project-1", {
          projectName: "Project One",
          projectPath: "/tmp/project-one",
          displayName: "Project One"
        }]])
      },
      awaitingManualProjectPath: false,
      resolved: false,
      interactiveMessageId: 41
    });

    await coordinator.handleProjectPick("chat-1", 41, "project-1");

    const created = store.getActiveSession("chat-1");
    assert.ok(created);
    assert.deepEqual(reanchorCalls, []);
  } finally {
    await cleanup();
  }
});

test("SessionProjectCoordinator leaves runtime hubs in place after manual-path confirmation creates a new session", async () => {
  const { coordinator, store, reanchorCalls, cleanup } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    (coordinator as any).pickerStates.set("chat-1", {
      picker: {
        projectMap: new Map([["manual-1", {
          projectName: "Manual Project",
          projectPath: "/tmp/manual-project",
          displayName: "Manual Project"
        }]])
      },
      awaitingManualProjectPath: true,
      resolved: false,
      interactiveMessageId: 52
    });

    await coordinator.confirmManualProject("chat-1", 52, "manual-1");

    const created = store.getActiveSession("chat-1");
    assert.ok(created);
    assert.deepEqual(reanchorCalls, []);
  } finally {
    await cleanup();
  }
});

test("handleNew deletes the previous picker and sends a fresh picker message", async () => {
  const {
    coordinator,
    store,
    sentMessages,
    deletedMessages,
    editedMessages,
    paths,
    cleanup
  } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    const projectPath = join(paths.homeDir, "Repo", "picker-project");
    await mkdir(projectPath, { recursive: true });
    store.createSession({
      chatId: "chat-1",
      projectName: "picker-project",
      projectPath
    });

    await coordinator.handleNew("chat-1");
    const firstPickerMessageId = sentMessages[0]?.messageId;
    assert.ok(firstPickerMessageId);

    await coordinator.handleNew("chat-1");

    assert.equal(sentMessages.length, 2);
    assert.match(sentMessages[0]?.text ?? "", /Choose a project for a new session/u);
    assert.match(sentMessages[1]?.text ?? "", /Choose a project for a new session/u);
    assert.deepEqual(deletedMessages, [firstPickerMessageId]);
    assert.deepEqual(editedMessages, []);
    assert.equal((coordinator as any).pickerStates.get("chat-1")?.interactiveMessageId, sentMessages[1]?.messageId);
  } finally {
    await cleanup();
  }
});

test("returnToProjectPicker deletes the current picker and sends a fresh picker message", async () => {
  const {
    coordinator,
    store,
    sentMessages,
    deletedMessages,
    editedMessages,
    paths,
    cleanup
  } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    await createDiscoveredProject(paths.homeDir, "picker-project");

    await coordinator.handleNew("chat-1");
    const firstPickerMessageId = sentMessages[0]?.messageId;
    assert.ok(firstPickerMessageId);

    await coordinator.enterManualPathMode("chat-1", firstPickerMessageId);
    const currentInteractiveMessageId = (coordinator as any).pickerStates.get("chat-1")?.interactiveMessageId;
    assert.ok(currentInteractiveMessageId);

    await coordinator.returnToProjectPicker("chat-1", currentInteractiveMessageId);

    assert.equal(sentMessages.length, 2);
    assert.match(sentMessages[1]?.text ?? "", /Choose a project for a new session/u);
    assert.deepEqual(deletedMessages, [currentInteractiveMessageId]);
    assert.equal(editedMessages[0]?.messageId, firstPickerMessageId);
    assert.equal((coordinator as any).pickerStates.get("chat-1")?.interactiveMessageId, sentMessages[1]?.messageId);
  } finally {
    await cleanup();
  }
});

test("stale picker message ids expire after a newer picker is sent", async () => {
  const {
    coordinator,
    store,
    sentMessages,
    deletedMessages,
    paths,
    cleanup
  } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    const projectPath = join(paths.homeDir, "Repo", "picker-project");

    await coordinator.handleNew("chat-1");
    (coordinator as any).pickerStates.get("chat-1")?.picker.projectMap.set("project-1", {
      projectKey: "project-1",
      projectName: "picker-project",
      projectPath,
      displayName: "picker-project"
    });
    const firstPickerMessageId = sentMessages[0]?.messageId;
    const firstProjectKey = [...((coordinator as any).pickerStates.get("chat-1")?.picker.projectMap.keys() ?? [])][0];
    assert.ok(firstPickerMessageId);
    assert.ok(firstProjectKey);

    await coordinator.handleNew("chat-1");
    const secondPickerMessageId = sentMessages[1]?.messageId;
    assert.ok(secondPickerMessageId);

    await coordinator.handleProjectPick("chat-1", firstPickerMessageId, firstProjectKey);

    assert.equal(store.getActiveSession("chat-1"), null);
    assert.deepEqual(deletedMessages, [firstPickerMessageId]);
    assert.equal(sentMessages.at(-1)?.text, "这个按钮已过期，请重新操作。");
    assert.equal((coordinator as any).pickerStates.get("chat-1")?.interactiveMessageId, secondPickerMessageId);
  } finally {
    await cleanup();
  }
});

test("handleArchive calls the runtime-surface archive hook after local persistence succeeds", async () => {
  const {
    coordinator,
    store,
    archiveHookCalls,
    unarchiveHookCalls,
    currentSessionCardCalls,
    cleanup
  } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.setActiveSession("chat-1", session.sessionId);

    await coordinator.handleArchive("chat-1");

    assert.equal(store.getSessionById(session.sessionId)?.archived, true);
    assert.deepEqual(archiveHookCalls, [{
      chatId: "chat-1",
      sessionId: session.sessionId,
      reason: "telegram_archive"
    }]);
    assert.deepEqual(unarchiveHookCalls, []);
    assert.deepEqual(currentSessionCardCalls, [{
      chatId: "chat-1",
      reason: "session_archived"
    }]);
  } finally {
    await cleanup();
  }
});

test("handleArchive keeps using the original store after remote archive mirroring begins", async () => {
  const { store, cleanup } = await createCoordinatorContext();
  const currentSessionCardCalls: Array<{ chatId: string; reason: string }> = [];
  const sentMessages: Array<{ text: string; html: boolean }> = [];
  const archivedThreadIds: string[] = [];
  const unarchivedThreadIds: string[] = [];
  let getStoreCalls = 0;

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.updateSessionThreadId(session.sessionId, "thread-1");
    store.setActiveSession("chat-1", session.sessionId);

    const coordinator = new SessionProjectCoordinator({
      logger: { warn: async () => {} },
      paths: { homeDir: "/tmp" },
      config: { projectScanRoots: [] },
      activePack: "telegram",
      preferBridgeCommandButtons: false,
      getStore: () => {
        getStoreCalls += 1;
        return getStoreCalls === 1 ? store : null;
      },
      getSnapshot: () => null,
      getUiLanguage: () => "zh",
      ensureAppServerAvailable: async () => ({
        archiveThread: async (threadId: string) => {
          archivedThreadIds.push(threadId);
        },
        unarchiveThread: async (threadId: string) => {
          unarchivedThreadIds.push(threadId);
        }
      }) as any,
      registerPendingThreadArchiveOp: () => 1,
      markPendingThreadArchiveCommit: async () => {},
      dropPendingThreadArchiveOp: () => {},
      safeSendMessage: async (_chatId, text) => {
        sentMessages.push({ text, html: false });
        return true;
      },
      safeSendMessageResult: async () => ({ messageId: 1 }),
      safeSendHtmlMessage: async (_chatId, text) => {
        sentMessages.push({ text, html: true });
        return true;
      },
      safeSendHtmlMessageResult: async () => ({ messageId: 1 }),
      safeEditMessageText: async () => ({ outcome: "edited" }),
      safeEditHtmlMessageText: async () => ({ outcome: "edited" }),
      safeDeleteMessage: async () => ({ outcome: "deleted" }),
      getActiveRuntimeStatusText: () => null,
      resolveSessionModelState: async (session) => ({
        configuredModel: session.selectedModel,
        configuredReasoningEffort: session.selectedReasoningEffort,
        effectiveModel: session.selectedModel,
        effectiveReasoningEffort: session.selectedReasoningEffort
      }),
      reanchorRuntimeAfterBridgeReply: async () => {},
      syncCurrentSessionCard: async (chatId, reason) => {
        currentSessionCardCalls.push({ chatId, reason });
      },
      handleSessionArchived: async () => {},
      handleSessionUnarchived: async () => {},
      openPreSessionBrowse: async () => true
    });

    await coordinator.handleArchive("chat-1");

    assert.deepEqual(archivedThreadIds, ["thread-1"]);
    assert.deepEqual(unarchivedThreadIds, []);
    assert.equal(store.getSessionById(session.sessionId)?.archived, true);
    assert.deepEqual(currentSessionCardCalls, [{ chatId: "chat-1", reason: "session_archived" }]);
    assert.equal(sentMessages.at(-1)?.html, true);
  } finally {
    await cleanup();
  }
});

test("handleArchive falls back to local-only archive when the remote thread is missing", async () => {
  const {
    coordinator,
    store,
    archiveHookCalls,
    currentSessionCardCalls,
    sentMessages,
    cleanup
  } = await createCoordinatorContext();
  const droppedPendingOps: Array<{ threadId: string; opId: number | null }> = [];
  const warnings: Array<{ message: string; meta: Record<string, unknown> | undefined }> = [];

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.updateSessionThreadId(session.sessionId, "thread-1");
    store.setActiveSession("chat-1", session.sessionId);

    (coordinator as any).deps.ensureAppServerAvailable = async () => ({
      archiveThread: async () => {
        throw new Error("thread not loaded: thread-1");
      },
      unarchiveThread: async () => {
        throw new Error("should not rollback stale thread archives");
      }
    });
    (coordinator as any).deps.registerPendingThreadArchiveOp = () => 7;
    (coordinator as any).deps.dropPendingThreadArchiveOp = (threadId: string, opId: number | null) => {
      droppedPendingOps.push({ threadId, opId });
    };
    (coordinator as any).deps.logger = {
      warn: async (message: string, meta?: Record<string, unknown>) => {
        warnings.push({ message, meta });
      }
    };

    await coordinator.handleArchive("chat-1");

    assert.equal(store.getSessionById(session.sessionId)?.archived, true);
    assert.deepEqual(archiveHookCalls, [{
      chatId: "chat-1",
      sessionId: session.sessionId,
      reason: "telegram_archive"
    }]);
    assert.deepEqual(currentSessionCardCalls, [{
      chatId: "chat-1",
      reason: "session_archived"
    }]);
    assert.equal(sentMessages.at(-1)?.html, true);
    assert.deepEqual(droppedPendingOps, [{ threadId: "thread-1", opId: 7 }]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.message, "archive falling back to local-only state after stale remote thread");
  } finally {
    await cleanup();
  }
});

test("handleArchive falls back to local-only archive when the remote thread has a stale rollout path", async () => {
  const {
    coordinator,
    store,
    archiveHookCalls,
    currentSessionCardCalls,
    sentMessages,
    cleanup
  } = await createCoordinatorContext();
  const droppedPendingOps: Array<{ threadId: string; opId: number | null }> = [];

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.updateSessionThreadId(session.sessionId, "thread-1");
    store.setActiveSession("chat-1", session.sessionId);

    (coordinator as any).deps.ensureAppServerAvailable = async () => ({
      archiveThread: async () => {
        throw new Error("state db returned stale rollout path for thread thread-1");
      },
      unarchiveThread: async () => {
        throw new Error("should not rollback stale rollout archives");
      }
    });
    (coordinator as any).deps.registerPendingThreadArchiveOp = () => 9;
    (coordinator as any).deps.dropPendingThreadArchiveOp = (threadId: string, opId: number | null) => {
      droppedPendingOps.push({ threadId, opId });
    };

    await coordinator.handleArchive("chat-1");

    assert.equal(store.getSessionById(session.sessionId)?.archived, true);
    assert.deepEqual(archiveHookCalls, [{
      chatId: "chat-1",
      sessionId: session.sessionId,
      reason: "telegram_archive"
    }]);
    assert.deepEqual(currentSessionCardCalls, [{
      chatId: "chat-1",
      reason: "session_archived"
    }]);
    assert.equal(sentMessages.at(-1)?.html, true);
    assert.deepEqual(droppedPendingOps, [{ threadId: "thread-1", opId: 9 }]);
  } finally {
    await cleanup();
  }
});

test("handleArchive keeps hard-failing when the remote archive error is not a stale thread", async () => {
  const {
    coordinator,
    store,
    archiveHookCalls,
    currentSessionCardCalls,
    sentMessages,
    cleanup
  } = await createCoordinatorContext();
  const droppedPendingOps: Array<{ threadId: string; opId: number | null }> = [];

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.updateSessionThreadId(session.sessionId, "thread-1");
    store.setActiveSession("chat-1", session.sessionId);

    (coordinator as any).deps.ensureAppServerAvailable = async () => ({
      archiveThread: async () => {
        throw new Error("app-server child is not running");
      },
      unarchiveThread: async () => {
        throw new Error("should not rollback failed archives");
      }
    });
    (coordinator as any).deps.registerPendingThreadArchiveOp = () => 11;
    (coordinator as any).deps.dropPendingThreadArchiveOp = (threadId: string, opId: number | null) => {
      droppedPendingOps.push({ threadId, opId });
    };

    await coordinator.handleArchive("chat-1");

    assert.equal(store.getSessionById(session.sessionId)?.archived, false);
    assert.deepEqual(archiveHookCalls, []);
    assert.deepEqual(currentSessionCardCalls, []);
    assert.equal(sentMessages.at(-1)?.text, "当前无法归档这个会话，请稍后重试。");
    assert.deepEqual(droppedPendingOps, [{ threadId: "thread-1", opId: 11 }]);
  } finally {
    await cleanup();
  }
});

test("handleUnarchive calls only the lightweight runtime-surface unarchive hook", async () => {
  const {
    coordinator,
    store,
    archiveHookCalls,
    unarchiveHookCalls,
    currentSessionCardCalls,
    cleanup
  } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.archiveSession(session.sessionId);

    await coordinator.handleUnarchive("chat-1", "1");

    assert.equal(store.getSessionById(session.sessionId)?.archived, false);
    assert.deepEqual(archiveHookCalls, []);
    assert.deepEqual(unarchiveHookCalls, [{
      chatId: "chat-1",
      sessionId: session.sessionId,
      reason: "telegram_unarchive"
    }]);
    assert.deepEqual(currentSessionCardCalls, [{
      chatId: "chat-1",
      reason: "session_unarchived"
    }]);
  } finally {
    await cleanup();
  }
});

test("handleUse refreshes the current session card after switching foreground session", async () => {
  const { coordinator, store, currentSessionCardCalls, cleanup } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    const first = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    const second = store.createSession({
      chatId: "chat-1",
      projectName: "Project Two",
      projectPath: "/tmp/project-two",
      displayName: "Session Two"
    });
    store.setActiveSession("chat-1", first.sessionId);

    await coordinator.handleUse("chat-1", "1");

    assert.equal(store.getActiveSession("chat-1")?.sessionId, second.sessionId);
    assert.deepEqual(currentSessionCardCalls, [{
      chatId: "chat-1",
      reason: "session_switched"
    }]);
  } finally {
    await cleanup();
  }
});

test("handleRenameInput refreshes the current session card after renaming the active session", async () => {
  const { coordinator, store, currentSessionCardCalls, cleanup } = await createCoordinatorContext();

  try {
    authorizeChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.setActiveSession("chat-1", session.sessionId);
    (coordinator as any).pendingRenameStates.set("chat-1", {
      kind: "session",
      sessionId: session.sessionId,
      projectPath: session.projectPath,
      sourceMessageId: null
    });

    await coordinator.handleRenameInput("chat-1", "Renamed Session");

    assert.equal(store.getSessionById(session.sessionId)?.displayName, "Renamed Session");
    assert.deepEqual(currentSessionCardCalls, [{
      chatId: "chat-1",
      reason: "session_renamed"
    }]);
  } finally {
    await cleanup();
  }
});

test("sendStatus uses the Feishu status surface when the Feishu pack is active", async () => {
  const { coordinator, store, sentMessages, cleanup } = await createCoordinatorContext({
    activePack: "feishu"
  });

  try {
    authorizeFeishuChat(store, "chat-1");
    const session = store.createSession({
      chatId: "chat-1",
      projectName: "Project One",
      projectPath: "/tmp/project-one",
      displayName: "Session One"
    });
    store.setActiveSession("chat-1", session.sessionId);
    store.writeReadinessSnapshot({
      state: "ready",
      checkedAt: "2026-04-18T10:00:00.000Z",
      details: {
        activePack: "feishu",
        codexInstalled: true,
        codexAuthenticated: true,
        appServerAvailable: true,
        packState: "ready",
        setupState: "complete",
        authorizedUserBound: true,
        issues: [],
        packChecks: [{
          id: "feishu_authorization_binding",
          ok: true,
          summary: "feishu authorization is bound"
        }]
      }
    });

    await coordinator.sendStatus("chat-1", null);

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.html, true);
    assert.match(sentMessages[0]?.text ?? "", /飞书状态/u);
    assert.match(sentMessages[0]?.text ?? "", /当前会话：/u);
    assert.deepEqual((sentMessages[0]?.replyMarkup as any)?.inline_keyboard?.[0]?.map((button: any) => button.text), [
      "新建会话",
      "最近会话",
      "当前状态"
    ]);
  } finally {
    await cleanup();
  }
});
