import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Logger } from "../logger.js";
import type { BridgePaths } from "../paths.js";
import { BridgeStateStore } from "../state/store.js";
import { buildProjectPicker } from "./discovery.js";

const testLogger: Logger = {
  info: async () => {},
  warn: async () => {},
  error: async () => {}
};

function createTestPaths(root: string): BridgePaths {
  const logsDir = join(root, "logs");
  const telegramSessionFlowLogsDir = join(logsDir, "telegram-session-flow");
  const runtimeDir = join(root, "runtime");

  return {
    homeDir: root,
    repoRoot: root,
    installRoot: join(root, "install"),
    stateRoot: join(root, "state"),
    configRoot: join(root, "config"),
    logsDir,
    perfLogsDir: join(logsDir, "perf"),
    telegramSessionFlowLogsDir,
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
    telegramStatusCardLogPath: join(telegramSessionFlowLogsDir, "status-card.log"),
    telegramPlanCardLogPath: join(telegramSessionFlowLogsDir, "plan-card.log"),
    telegramErrorCardLogPath: join(telegramSessionFlowLogsDir, "error-card.log")
  };
}

async function createDiscoveryContext(): Promise<{
  root: string;
  paths: BridgePaths;
  store: BridgeStateStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "ctb-discovery-test-"));
  const paths = createTestPaths(root);
  await Promise.all([
    mkdir(paths.stateRoot, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.configRoot, { recursive: true })
  ]);

  const store = await BridgeStateStore.open(paths, testLogger);
  return {
    root,
    paths,
    store,
    cleanup: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  };
}

test("buildProjectPicker returns empty guidance without scan-driven groups", async () => {
  const { root, store, cleanup } = await createDiscoveryContext();

  try {
    const picker = await buildProjectPicker(root, [], store);
    assert.equal(picker.groups.length, 0);
    assert.equal(picker.emptyText, "还没有最近项目，请浏览目录或手动输入路径。");
    assert.deepEqual(picker.noticeLines, []);
    assert.equal(picker.partial, false);
    assert.equal(picker.allRootsFailed, false);
  } finally {
    await cleanup();
  }
});

test("buildProjectPicker keeps the /new picker to pinned and recent groups only", async () => {
  const { root, store, cleanup } = await createDiscoveryContext();
  const recentNames = ["recent-a", "recent-b", "recent-c", "recent-d", "recent-e", "recent-f"];

  try {
    await mkdir(join(root, "projects"), { recursive: true });
    for (const name of recentNames) {
      const projectPath = join(root, "projects", name);
      await mkdir(projectPath, { recursive: true });
      store.createSession({
        chatId: "chat-1",
        projectName: name,
        projectPath
      });
    }

    store.pinProject({
      projectPath: join(root, "projects", "recent-e"),
      projectName: "recent-e",
      sessionId: null
    });
    store.pinProject({
      projectPath: join(root, "projects", "recent-f"),
      projectName: "recent-f",
      sessionId: null
    });

    const picker = await buildProjectPicker(root, [], store);
    const recentGroup = picker.groups.find((group) => group.key === "recent");
    const pinnedGroup = picker.groups.find((group) => group.key === "pinned");

    assert.equal(picker.groups.some((group) => group.key === "pinned"), true);
    assert.equal(picker.groups.some((group) => (group as any).key === "discovered"), false);
    assert.equal(pinnedGroup?.candidates.length, 2);
    assert.equal(recentGroup?.candidates.length, 3);
    assert.equal(picker.groups.flatMap((group) => group.candidates).length, 5);
    assert.equal(picker.projectMap.size, recentNames.length);
  } finally {
    await cleanup();
  }
});
