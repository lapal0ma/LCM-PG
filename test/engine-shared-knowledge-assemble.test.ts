import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LcmConfig } from "../src/db/config.js";
import { closeLcmConnection, createLcmDatabaseConnection } from "../src/db/connection.js";
import { LcmContextEngine } from "../src/engine.js";
import type { LcmDependencies } from "../src/types.js";

const {
  ensureSharedKnowledgeTablesMock,
  seedKnowledgeRolesMock,
  searchSharedKnowledgeMock,
} = vi.hoisted(() => ({
  ensureSharedKnowledgeTablesMock: vi.fn(async () => {}),
  seedKnowledgeRolesMock: vi.fn(async () => {}),
  searchSharedKnowledgeMock: vi.fn(async () => []),
}));

vi.mock("../src/mirror/pg-reader.js", () => ({
  ensureSharedKnowledgeTables: ensureSharedKnowledgeTablesMock,
  seedKnowledgeRoles: seedKnowledgeRolesMock,
  searchSharedKnowledge: searchSharedKnowledgeMock,
}));

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
  const value = sessionKey.trim();
  if (!value.startsWith("agent:")) {
    return null;
  }
  const parts = value.split(":");
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
    mirrorConfig: {
      enabled: true,
      databaseUrl: "postgresql://default:test@localhost:5432/lcm",
      agentDatabaseUrls: {},
      mode: "latest_nodes",
      maxNodes: 5,
      queueConcurrency: 1,
      maxRetries: 2,
      sharedKnowledgeEnabled: true,
      assembleSharedKnowledge: true,
      assembleSharedKnowledgeMaxTokens: 1200,
      assembleSharedKnowledgeLimit: 3,
      assembleSharedKnowledgeTimeoutMs: 300,
      adminRoleName: "admin",
      bootstrapAdminAgentIds: ["main"],
      roleBootstrapMap: { main: ["admin"] },
    },
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

function createEngineWithSharedKnowledgeAssemble(): LcmContextEngine {
  const tempDir = mkdtempSync(join(tmpdir(), "lcm-pg-engine-shared-assemble-"));
  tempDirs.push(tempDir);
  const config = createTestConfig(join(tempDir, "lcm.db"));
  const db = createLcmDatabaseConnection(config.databasePath);
  dbs.push(db);
  return new LcmContextEngine(createTestDeps(config), db);
}

beforeEach(() => {
  ensureSharedKnowledgeTablesMock.mockClear();
  seedKnowledgeRolesMock.mockClear();
  searchSharedKnowledgeMock.mockReset();
});

afterEach(() => {
  for (const db of dbs.splice(0)) {
    closeLcmConnection(db);
  }
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("LcmContextEngine shared knowledge assemble injection", () => {
  it("appends shared knowledge block to systemPromptAddition", async () => {
    searchSharedKnowledgeMock.mockResolvedValue([
      {
        knowledgeId: "k1",
        ownerAgentId: "main",
        visibility: "shared",
        visibleTo: [],
        editableBy: [],
        title: "Rate Limit",
        content: "API rate limit is 100 req/min.",
        sourceMirrorIds: [],
        tags: ["api"],
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);

    const engine = createEngineWithSharedKnowledgeAssemble();
    const sessionId = "sid-shared-1";
    const sessionKey = "agent:main:main";
    const conversation = await engine.getConversationStore().getOrCreateConversation(sessionId, { sessionKey });
    await engine.getSummaryStore().insertSummary({
      summaryId: "sum_shared_1",
      conversationId: conversation.conversationId,
      kind: "leaf",
      content: "Existing compacted context",
      tokenCount: 20,
    });
    await engine.getSummaryStore().appendContextSummary(conversation.conversationId, "sum_shared_1");

    const assembled = await engine.assemble({
      sessionId,
      sessionKey,
      messages: [{ role: "user", content: "What's the API limit?", timestamp: Date.now() }] as never,
      tokenBudget: 16_000,
    });

    expect(ensureSharedKnowledgeTablesMock).toHaveBeenCalledTimes(1);
    expect(searchSharedKnowledgeMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agentId: "main",
        query: "What's the API limit?",
      }),
    );
    expect((assembled as { systemPromptAddition?: string }).systemPromptAddition).toContain(
      "Workspace Shared Knowledge",
    );
    expect((assembled as { systemPromptAddition?: string }).systemPromptAddition).toContain(
      "Rate Limit",
    );
  });

  it("skips shared knowledge block when lookup fails", async () => {
    searchSharedKnowledgeMock.mockRejectedValue(new Error("pg timeout"));

    const engine = createEngineWithSharedKnowledgeAssemble();
    const sessionId = "sid-shared-2";
    const sessionKey = "agent:main:main";
    const conversation = await engine.getConversationStore().getOrCreateConversation(sessionId, { sessionKey });
    await engine.getSummaryStore().insertSummary({
      summaryId: "sum_shared_2",
      conversationId: conversation.conversationId,
      kind: "leaf",
      content: "Existing compacted context",
      tokenCount: 20,
    });
    await engine.getSummaryStore().appendContextSummary(conversation.conversationId, "sum_shared_2");

    const assembled = await engine.assemble({
      sessionId,
      sessionKey,
      messages: [{ role: "user", content: "Find policy notes", timestamp: Date.now() }] as never,
      tokenBudget: 16_000,
    });

    expect(searchSharedKnowledgeMock).toHaveBeenCalledTimes(1);
    expect((assembled as { systemPromptAddition?: string }).systemPromptAddition).not.toContain(
      "Workspace Shared Knowledge",
    );
    expect(engine["deps"].log.warn).toHaveBeenCalledWith(
      expect.stringContaining("shared-knowledge assemble: skipped due to error"),
    );
  });
});
