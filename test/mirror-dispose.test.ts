import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LcmConfig } from "../src/db/config.js";
import { closeLcmConnection, createLcmDatabaseConnection } from "../src/db/connection.js";
import { LcmContextEngine } from "../src/engine.js";
import { resolveLcmMirrorConfig } from "../src/mirror/config.js";
import type { LcmDependencies } from "../src/types.js";

const { closeAllMirrorPoolsMock } = vi.hoisted(() => ({
  closeAllMirrorPoolsMock: vi.fn(async () => {}),
}));

vi.mock("../src/mirror/pg-sink.js", () => ({
  closeAllMirrorPools: closeAllMirrorPoolsMock,
  upsertLcmMirrorRow: vi.fn(async () => {}),
}));

type MirrorQueueLike = {
  flush: () => Promise<void>;
};

type DisposeTestEngine = LcmContextEngine & {
  mirrorQueue: MirrorQueueLike | null;
};

const tempDirs: string[] = [];
const dbs: ReturnType<typeof createLcmDatabaseConnection>[] = [];

function createTestConfig(databasePath: string): LcmConfig {
  return {
    enabled: true,
    databasePath,
    ignoreSessionPatterns: [],
    statelessSessionPatterns: [],
    skipStatelessSessions: true,
    contextThreshold: 0.75,
    freshTailCount: 8,
    leafMinFanout: 8,
    condensedMinFanout: 4,
    condensedMinFanoutHard: 2,
    incrementalMaxDepth: 0,
    leafChunkTokens: 20_000,
    leafTargetTokens: 600,
    condensedTargetTokens: 900,
    maxExpandTokens: 4000,
    largeFileTokenThreshold: 25_000,
    summaryProvider: "",
    summaryModel: "",
    largeFileSummaryProvider: "",
    largeFileSummaryModel: "",
    autocompactDisabled: false,
    timezone: "UTC",
    pruneHeartbeatOk: false,
  };
}

function createTestDeps(config: LcmConfig): LcmDependencies {
  return {
    config,
    mirrorConfig: resolveLcmMirrorConfig(
      {
        LCM_MIRROR_ENABLED: "true",
        LCM_MIRROR_DATABASE_URL: "postgresql://user:pass@localhost:5432/lcm_test",
      } as NodeJS.ProcessEnv,
      {},
    ),
    complete: vi.fn(async () => ({
      content: [{ type: "text", text: "summary output" }],
    })),
    callGateway: vi.fn(async () => ({})),
    resolveModel: vi.fn(() => ({ provider: "anthropic", model: "claude-opus-4-5" })),
    getApiKey: vi.fn(async () => process.env.ANTHROPIC_API_KEY),
    requireApiKey: vi.fn(async () => process.env.ANTHROPIC_API_KEY ?? "test-api-key"),
    parseAgentSessionKey: () => null,
    isSubagentSessionKey: () => false,
    normalizeAgentId: (id?: string) => (id?.trim() ? id : "main"),
    buildSubagentSystemPrompt: () => "subagent prompt",
    readLatestAssistantReply: () => undefined,
    resolveAgentDir: () => process.env.HOME ?? tmpdir(),
    resolveSessionIdFromSessionKey: async () => undefined,
    agentLaneSubagent: "subagent",
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

function createDisposeTestEngine(): DisposeTestEngine {
  const tempDir = mkdtempSync(join(tmpdir(), "lcm-pg-mirror-dispose-"));
  tempDirs.push(tempDir);
  const config = createTestConfig(join(tempDir, "lcm.db"));
  const db = createLcmDatabaseConnection(config.databasePath);
  dbs.push(db);
  return new LcmContextEngine(createTestDeps(config), db) as DisposeTestEngine;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    closeLcmConnection(db);
  }
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  closeAllMirrorPoolsMock.mockClear();
});

describe("LcmContextEngine.dispose mirror cleanup", () => {
  it("flushes pending mirror work before closing PG pools", async () => {
    const engine = createDisposeTestEngine();
    let resolveFlush!: () => void;
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFlush = resolve;
        }),
    );
    engine.mirrorQueue = { flush };

    const disposePromise = engine.dispose();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(closeAllMirrorPoolsMock).not.toHaveBeenCalled();

    resolveFlush();
    await disposePromise;

    expect(closeAllMirrorPoolsMock).toHaveBeenCalledTimes(1);
  });

  it("still closes PG pools when mirror flush fails", async () => {
    const engine = createDisposeTestEngine();
    const flushError = new Error("flush failed");
    const flush = vi.fn(async () => {
      throw flushError;
    });
    engine.mirrorQueue = { flush };

    await engine.dispose();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(closeAllMirrorPoolsMock).toHaveBeenCalledTimes(1);
    expect(engine["deps"].log.warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to flush pending jobs during dispose"),
    );
  });
});
