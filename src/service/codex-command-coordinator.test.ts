import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodexAppServerClient } from "../codex/app-server.js";
import type { Logger } from "../logger.js";
import type { BridgePaths } from "../paths.js";
import { BridgeStateStore } from "../state/store.js";
import { CodexCommandCoordinator } from "./codex-command-coordinator.js";

const testLogger: Logger = {
  info: async () => {},
  warn: async () => {},
  error: async () => {}
};

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

function authorizeChatWithSession(store: BridgeStateStore, chatId: string) {
  store.upsertPendingAuthorization({
    userId: chatId,
    chatId: chatId,
    username: "tester",
    displayName: "Tester"
  });
  const candidate = store.listPendingAuthorizations()[0];
  if (!candidate) {
    throw new Error("expected pending authorization candidate");
  }
  store.confirmPendingAuthorization(candidate);

  const session = store.createSession({
    chatId: chatId,
    projectName: "Project One",
    projectPath: "/tmp/project-one",
    displayName: "Project One"
  });
  store.setActiveSession(chatId, session.sessionId);
  return store.getSessionById(session.sessionId) ?? session;
}

async function createCoordinatorContext(options: {
  appServer?: Record<string, unknown>;
  fetchAllModels?: () => Promise<
    NonNullable<Awaited<ReturnType<CodexAppServerClient["listModels"]>>["data"]>
  >;
  fetchAllApps?: () => Promise<
    NonNullable<Awaited<ReturnType<CodexAppServerClient["listApps"]>>["data"]>
  >;
  fetchAllMcpServerStatuses?: () => Promise<
    NonNullable<Awaited<ReturnType<CodexAppServerClient["listMcpServerStatuses"]>>["data"]>
  >;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "ctb-codex-command-test-"));
  const paths = createTestPaths(root);
  await Promise.all([
    mkdir(paths.installRoot, { recursive: true }),
    mkdir(paths.stateRoot, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.configRoot, { recursive: true })
  ]);

  const store = await BridgeStateStore.open(paths, testLogger);
  const sentMessages: string[] = [];
  const sentMessageEntries: Array<{ text: string; replyMarkup?: unknown }> = [];
  const sentHtmlMessages: string[] = [];
  const editedMessages: Array<{ messageId: number; text: string; replyMarkup?: unknown }> = [];
  const answeredCallbackQueries: Array<{ callbackQueryId: string; text?: string }> = [];
  const submittedInputs: Array<{
    chatId: string;
    sessionId: string;
    inputs: unknown[];
    prompt: string | null;
    promptLabel: string;
  }> = [];
  const beginActiveTurnCalls: Array<{
    chatId: string;
    sessionId: string;
    threadId: string;
    turnId: string;
    turnStatus: string;
    mode: "default" | "review";
  }> = [];
  const clearedRecentActivity: string[] = [];
  const syncCurrentSessionCardReasons: string[] = [];
  const appServer = options.appServer ?? {};

  const coordinator = new CodexCommandCoordinator({
    getStore: () => store,
    ensureAppServerAvailable: async () => appServer as never,
    startFreshThreadForClear: async (session) => {
      const startThread = (appServer as any).startThread;
      if (typeof startThread !== "function") {
        throw new Error(`missing startThread stub for ${session.sessionId}`);
      }
      return await startThread({
        cwd: session.projectPath,
        ...(session.selectedModel ? { model: session.selectedModel } : {}),
        sessionStartSource: "clear"
      });
    },
    fetchAllModels: async () => options.fetchAllModels ? await options.fetchAllModels() : [],
    fetchAllApps: async () => options.fetchAllApps ? await options.fetchAllApps() : [],
    fetchAllMcpServerStatuses: async () =>
      options.fetchAllMcpServerStatuses ? await options.fetchAllMcpServerStatuses() : [],
    resolveSessionModelState: async (session) => ({
      configuredModel: session.selectedModel,
      configuredReasoningEffort: session.selectedReasoningEffort,
      effectiveModel: session.selectedModel,
      effectiveReasoningEffort: session.selectedReasoningEffort
    }),
    ensureSessionThread: async () => "thread-source",
    beginActiveTurn: async (chatId, session, threadId, turnId, turnStatus, options) => {
      beginActiveTurnCalls.push({
        chatId,
        sessionId: session.sessionId,
        threadId,
        turnId,
        turnStatus,
        mode: options?.mode ?? "default"
      });
    },
    submitOrQueueRichInput: async (chatId, session, inputs, prompt, promptLabel) => {
      submittedInputs.push({
        chatId,
        sessionId: session.sessionId,
        inputs,
        prompt,
        promptLabel
      });
    },
    getRunningTurnCapacity: () => ({
      allowed: true,
      runningCount: 0,
      limit: 10
    }),
    resolvePendingInteractionsForSession: async () => {},
    resetPendingTransientInputs: () => {},
    clearRecentActivity: (sessionId) => {
      clearedRecentActivity.push(sessionId);
    },
    syncCurrentSessionCard: async (_chatId, reason) => {
      syncCurrentSessionCardReasons.push(reason);
    },
    safeSendMessage: async (_chatId, text) => {
      sentMessages.push(text);
      sentMessageEntries.push({ text });
      return true;
    },
    safeSendHtmlMessage: async (_chatId, text) => {
      sentHtmlMessages.push(text);
      return true;
    },
    safeEditMessageText: async (_chatId, messageId, text, replyMarkup) => {
      editedMessages.push({ messageId, text, replyMarkup });
      return true;
    },
    safeEditHtmlMessageText: async (_chatId, messageId, text, replyMarkup) => {
      editedMessages.push({ messageId, text, replyMarkup });
      return true;
    },
    safeAnswerCallbackQuery: async (callbackQueryId, text) => {
      answeredCallbackQueries.push(text === undefined ? { callbackQueryId } : { callbackQueryId, text });
    }
  });

  return {
    coordinator,
    store,
    sentMessages,
    sentMessageEntries,
    sentHtmlMessages,
    editedMessages,
    answeredCallbackQueries,
    submittedInputs,
    beginActiveTurnCalls,
    clearedRecentActivity,
    syncCurrentSessionCardReasons,
    cleanup: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  };
}

test("CodexCommandCoordinator lists skills and turns /skill into structured input submission", async () => {
  const { coordinator, store, sentMessages, submittedInputs, cleanup } = await createCoordinatorContext({
    appServer: {
      listSkills: async () => ({
        data: [{
          cwd: "/tmp/project-one",
          errors: [],
          skills: [{
            name: "deploy",
            path: "/skills/deploy",
            enabled: true,
            shortDescription: "Deploy the current project"
          }]
        }]
      })
    }
  });

  try {
    const session = authorizeChatWithSession(store, "1");

    await coordinator.handleSkills("1");
    await coordinator.handleSkill("1", "deploy :: ship it");

    assert.match(sentMessages[0] ?? "", /Current session: Project One/u);
    assert.match(sentMessages[0] ?? "", /Current project: Project One/u);
    assert.match(sentMessages[0] ?? "", /Available skills/u);
    assert.match(sentMessages[0] ?? "", /\[enabled\] deploy \| Deploy the current project/u);
    assert.deepEqual(submittedInputs, [{
      chatId: "1",
      sessionId: session.sessionId,
      inputs: [{
        type: "skill",
        name: "deploy",
        path: "/skills/deploy"
      }],
      prompt: "ship it",
      promptLabel: "skill：deploy"
    }]);
  } finally {
    await cleanup();
  }
});

test("CodexCommandCoordinator owns model picker selection and persists the chosen model", async () => {
  const { coordinator, store, sentMessages, editedMessages, answeredCallbackQueries, cleanup } = await createCoordinatorContext({
    appServer: {
      listModels: async () => ({ data: [], nextCursor: null })
    },
    fetchAllModels: async () => [{
      id: "gpt-4.1",
      model: "gpt-4.1",
      displayName: "GPT-4.1",
      isDefault: true,
      hidden: false,
      description: "balanced",
      defaultReasoningEffort: "minimal",
      supportedReasoningEfforts: [{ reasoningEffort: "minimal", description: "minimal" }]
    }]
  });

  try {
    const session = authorizeChatWithSession(store, "1");

    await coordinator.handleModel("1", "");
    await coordinator.handleModelPickCallback("cb-model", "1", 1301, session.sessionId, 0);

    assert.match(sentMessages[0] ?? "", /选择模型/u);
    assert.equal(store.getActiveSession("1")?.selectedModel, "gpt-4.1");
    assert.equal(store.getActiveSession("1")?.selectedReasoningEffort, null);
    assert.match(editedMessages.at(-1)?.text ?? "", /已为会话「Project One」设置模型：gpt-4.1 \+ 默认/u);
    assert.deepEqual(answeredCallbackQueries, [{ callbackQueryId: "cb-model" }]);
  } finally {
    await cleanup();
  }
});

test("CodexCommandCoordinator lists plugins and handles install and uninstall flows", async () => {
  const installCalls: unknown[] = [];
  const uninstallCalls: string[] = [];
  const { coordinator, store, sentMessages, cleanup } = await createCoordinatorContext({
    appServer: {
      listPlugins: async () => ({
        marketplaces: [{
          name: "repo-market",
          path: "/marketplaces/repo",
          plugins: [
            {
              id: "repo.logs",
              name: "logs",
              installed: true,
              enabled: true,
              source: { type: "local", path: "/plugins/logs" },
              interface: {
                displayName: "Logs",
                shortDescription: "Inspect runtime logs"
              }
            },
            {
              id: "repo.deploy",
              name: "deploy",
              installed: false,
              enabled: false,
              source: { type: "local", path: "/plugins/deploy" },
              interface: {
                displayName: "Deploy",
                shortDescription: "Deploy the current project"
              }
            }
          ]
        }]
      }),
      installPlugin: async (payload: unknown) => {
        installCalls.push(payload);
        return {
          appsNeedingAuth: [{
            id: "slack",
            name: "Slack",
            description: "Connect Slack notifications",
            installUrl: "https://apps.example/slack"
          }]
        };
      },
      uninstallPlugin: async (pluginId: string) => {
        uninstallCalls.push(pluginId);
      }
    }
  });

  try {
    authorizeChatWithSession(store, "1");

    await coordinator.handlePlugins("1");
    await coordinator.handlePlugin("1", "install repo-market/deploy");
    await coordinator.handlePlugin("1", "uninstall repo.logs");

    assert.match(sentMessages[0] ?? "", /当前会话: Project One/u);
    assert.match(sentMessages[0] ?? "", /当前项目: Project One/u);
    assert.match(sentMessages[0] ?? "", /可用插件/u);
    assert.match(sentMessages[0] ?? "", /\[已安装\]\[启用\] repo\.logs \| Logs/u);
    assert.match(sentMessages[0] ?? "", /repo-market\/deploy/u);
    assert.deepEqual(installCalls, [{
      marketplacePath: "/marketplaces/repo",
      pluginName: "deploy"
    }]);
    assert.deepEqual(uninstallCalls, ["repo.logs"]);
    assert.match(sentMessages[1] ?? "", /已为项目「Project One」安装插件：deploy/u);
    assert.match(sentMessages[1] ?? "", /Slack/u);
    assert.match(sentMessages[2] ?? "", /已为项目「Project One」卸载插件：repo\.logs/u);
  } finally {
    await cleanup();
  }
});

test("CodexCommandCoordinator starts review mode in a dedicated session when the server forks a review thread", async () => {
  const reviewCalls: unknown[] = [];
  const { coordinator, store, sentMessages, beginActiveTurnCalls, cleanup } = await createCoordinatorContext({
    appServer: {
      reviewStart: async (payload: unknown) => {
        reviewCalls.push(payload);
        return {
          reviewThreadId: "thread-review-new",
          turn: { id: "turn-review", status: "inProgress" }
        };
      }
    }
  });

  try {
    const session = authorizeChatWithSession(store, "1");
    store.setSessionSelectedModel(session.sessionId, "gpt-5");

    await coordinator.handleReview("1", "detached branch main");

    const reviewSession = store.getActiveSession("1");
    assert.ok(reviewSession);
    assert.notEqual(reviewSession?.sessionId, session.sessionId);
    assert.equal(reviewSession?.threadId, "thread-review-new");
    assert.equal(reviewSession?.selectedModel, "gpt-5");
    assert.match(sentMessages[0] ?? "", /已创建审查会话/u);
    assert.deepEqual(reviewCalls, [{
      threadId: "thread-source",
      target: { type: "baseBranch", branch: "main" },
      delivery: "detached"
    }]);
    assert.deepEqual(beginActiveTurnCalls, [{
      chatId: "1",
      sessionId: reviewSession!.sessionId,
      threadId: "thread-review-new",
      turnId: "turn-review",
      turnStatus: "inProgress",
      mode: "review"
    }]);
  } finally {
    await cleanup();
  }
});

test("CodexCommandCoordinator direct rollback updates session head and clears recent activity", async () => {
  const rollbackCalls: Array<{ threadId: string; numTurns: number }> = [];
  const { coordinator, store, sentMessages, clearedRecentActivity, cleanup } = await createCoordinatorContext({
    appServer: {
      rollbackThread: async (threadId: string, numTurns: number) => {
        rollbackCalls.push({ threadId, numTurns });
        return {
          thread: {
            id: threadId,
            turns: [{ id: "turn-after-rollback", status: "completed" }]
          }
        };
      }
    }
  });

  try {
    const session = authorizeChatWithSession(store, "1");
    store.updateSessionThreadId(session.sessionId, "thread-rb");

    await coordinator.handleRollback("1", "1");

    assert.deepEqual(rollbackCalls, [{ threadId: "thread-rb", numTurns: 1 }]);
    assert.deepEqual(clearedRecentActivity, [session.sessionId]);
    assert.equal(store.getSessionById(session.sessionId)?.lastTurnId, "turn-after-rollback");
    assert.equal(store.getSessionById(session.sessionId)?.lastTurnStatus, "completed");
    assert.match(sentMessages.at(-1) ?? "", /已为会话「Project One」回滚最近 1 个 turn/u);
  } finally {
    await cleanup();
  }
});

test("CodexCommandCoordinator compact requests thread compaction for the active idle session", async () => {
  const compactCalls: string[] = [];
  const { coordinator, store, sentMessages, cleanup } = await createCoordinatorContext({
    appServer: {
      compactThread: async (threadId: string) => {
        compactCalls.push(threadId);
      }
    }
  });

  try {
    const session = authorizeChatWithSession(store, "1");
    store.updateSessionThreadId(session.sessionId, "thread-compact");

    await coordinator.handleCompact("1");

    assert.deepEqual(compactCalls, ["thread-compact"]);
    assert.match(sentMessages.at(-1) ?? "", /已为会话「Project One」请求压缩当前线程/u);
  } finally {
    await cleanup();
  }
});

test("CodexCommandCoordinator clear starts a replacement thread and archives the previous one", async () => {
  const startThreadCalls: unknown[] = [];
  const {
    coordinator,
    store,
    sentMessages,
    clearedRecentActivity,
    syncCurrentSessionCardReasons,
    cleanup
  } = await createCoordinatorContext({
    appServer: {
      startThread: async (payload: unknown) => {
        startThreadCalls.push(payload);
        return {
          thread: {
            id: "thread-clear-replacement"
          }
        };
      }
    }
  });

  try {
    const session = authorizeChatWithSession(store, "1");
    store.updateSessionThreadId(session.sessionId, "thread-clear");
    store.updateSessionStatus(session.sessionId, "failed", {
      lastTurnId: "turn-clear",
      lastTurnStatus: "failed"
    });

    await coordinator.handleClear("1");

    const updated = store.getSessionById(session.sessionId);
    assert.equal(updated?.threadId, "thread-clear-replacement");
    assert.equal(updated?.lastTurnId, null);
    assert.equal(updated?.lastTurnStatus, null);
    assert.equal(updated?.status, "idle");
    assert.deepEqual(startThreadCalls, [{
      cwd: "/tmp/project-one",
      sessionStartSource: "clear"
    }]);
    assert.deepEqual(clearedRecentActivity, [session.sessionId]);
    assert.deepEqual(syncCurrentSessionCardReasons, ["session_cleared"]);
    assert.match(sentMessages.at(-1) ?? "", /已清空会话「Project One」的上下文/u);
    assert.match(sentMessages.at(-1) ?? "", /立即切换到新的 Codex 线程/u);

    const archived = store.listSessions("1", { archived: true });
    assert.equal(archived.length, 1);
    assert.equal(archived[0]?.threadId, "thread-clear");
    assert.match(archived[0]?.displayName ?? "", /清空前：Project One/u);
  } finally {
    await cleanup();
  }
});
