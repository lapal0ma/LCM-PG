import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LcmConfig } from "../src/db/config.js";
import { closeLcmConnection, createLcmDatabaseConnection } from "../src/db/connection.js";
import { LcmContextEngine } from "../src/engine.js";
import { resolveLcmMirrorConfig } from "../src/mirror/config.js";
import type { LcmDependencies } from "../src/types.js";

const { closeAllMirrorPoolsMock, upsertLcmMirrorRowMock } = vi.hoisted(() => ({
  closeAllMirrorPoolsMock: vi.fn(async () => {}),
  upsertLcmMirrorRowMock: vi.fn(async () => {}),
}));

vi.mock("../src/mirror/pg-sink.js", () => ({
  closeAllMirrorPools: closeAllMirrorPoolsMock,
  upsertLcmMirrorRow: upsertLcmMirrorRowMock,
}));

type RoutingTestEngine = LcmContextEngine & {
  runMirrorJobOnce(params: { sessionId: string; sessionKey?: string }): Promise<void>;
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

function parseAgentSessionKey(sessionKey: string): { agentId: string; suffix: string } | null {
  const trimmed = sessionKey.trim();
  if (!trimmed.startsWith("agent:")) {
    return null;
  }
  const parts = trimmed.split(":");
  if (parts.length < 3) {
    return null;
  }
  const agentId = parts[1]?.trim();
  const suffix = parts.slice(2).join(":").trim();
  if (!agentId || !suffix) {
    return null;
  }
  return { agentId, suffix };
}

function createTestDeps(config: LcmConfig): LcmDependencies {
  return {
    config,
    mirrorConfig: resolveLcmMirrorConfig(
      {
        LCM_MIRROR_ENABLED: "true",
        LCM_MIRROR_DATABASE_URL: "postgresql://default:test@localhost:5432/lcm_default",
        LCM_MIRROR_AGENT_PG_MAP: JSON.stringify({
          worker: "postgresql://worker:test@localhost:5432/lcm_worker",
        }),
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
    parseAgentSessionKey,
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

function createRoutingTestEngine(): RoutingTestEngine {
  const tempDir = mkdtempSync(join(tmpdir(), "lcm-pg-mirror-routing-"));
  tempDirs.push(tempDir);
  const config = createTestConfig(join(tempDir, "lcm.db"));
  const db = createLcmDatabaseConnection(config.databasePath);
  dbs.push(db);
  return new LcmContextEngine(createTestDeps(config), db) as RoutingTestEngine;
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
  upsertLcmMirrorRowMock.mockClear();
  closeAllMirrorPoolsMock.mockClear();
});

describe("LcmContextEngine mirror routing", () => {
  it("falls back to the persisted conversation sessionKey when afterTurn omits it", async () => {
    const engine = createRoutingTestEngine();
    const conversation = await engine.getConversationStore().getOrCreateConversation("sid-worker", {
      sessionKey: "agent:worker:main",
    });
    await engine.getSummaryStore().insertSummary({
      summaryId: "sum_worker",
      conversationId: conversation.conversationId,
      kind: "leaf",
      content: "worker summary",
      tokenCount: 10,
    });

    await engine.runMirrorJobOnce({ sessionId: "sid-worker" });

    expect(upsertLcmMirrorRowMock).toHaveBeenCalledTimes(1);
    expect(upsertLcmMirrorRowMock).toHaveBeenCalledWith(
      "postgresql://worker:test@localhost:5432/lcm_worker",
      expect.objectContaining({
        agentId: "worker",
        sessionKey: "agent:worker:main",
        conversationId: conversation.conversationId,
      }),
    );
  });

  it("skips mirroring with a warning when no parseable sessionKey is available", async () => {
    const engine = createRoutingTestEngine();
    const conversation = await engine.getConversationStore().getOrCreateConversation("sid-no-key");
    await engine.getSummaryStore().insertSummary({
      summaryId: "sum_no_key",
      conversationId: conversation.conversationId,
      kind: "leaf",
      content: "summary without session key",
      tokenCount: 10,
    });

    await engine.runMirrorJobOnce({ sessionId: "sid-no-key" });

    expect(upsertLcmMirrorRowMock).not.toHaveBeenCalled();
    expect(engine["deps"].log.warn).toHaveBeenCalledWith(
      expect.stringContaining("unable to resolve agent identity"),
    );
  });

  it("falls back to the persisted sessionKey when the runtime sessionKey is malformed", async () => {
    const engine = createRoutingTestEngine();
    const conversation = await engine.getConversationStore().getOrCreateConversation("sid-fallback", {
      sessionKey: "agent:worker:main",
    });
    await engine.getSummaryStore().insertSummary({
      summaryId: "sum_fallback",
      conversationId: conversation.conversationId,
      kind: "leaf",
      content: "fallback summary",
      tokenCount: 10,
    });

    await engine.runMirrorJobOnce({
      sessionId: "sid-fallback",
      sessionKey: "not-a-real-session-key",
    });

    expect(upsertLcmMirrorRowMock).toHaveBeenCalledTimes(1);
    expect(upsertLcmMirrorRowMock).toHaveBeenCalledWith(
      "postgresql://worker:test@localhost:5432/lcm_worker",
      expect.objectContaining({
        agentId: "worker",
        sessionKey: "agent:worker:main",
      }),
    );
  });
});
