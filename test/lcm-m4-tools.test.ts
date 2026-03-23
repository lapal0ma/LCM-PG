import { describe, expect, it, vi, beforeEach } from "vitest";
import { createLcmManageRolesTool } from "../src/tools/lcm-manage-roles-tool.js";
import { createLcmMirrorSearchTool } from "../src/tools/lcm-mirror-search-tool.js";
import { createLcmSharedKnowledgeSearchTool } from "../src/tools/lcm-shared-knowledge-search-tool.js";
import { createLcmSharedKnowledgeWriteTool } from "../src/tools/lcm-shared-knowledge-write-tool.js";
import type { LcmDependencies } from "../src/types.js";

const {
  ensureSharedKnowledgeTablesMock,
  seedKnowledgeRolesMock,
  agentHasRoleMock,
  listKnowledgeRolesMock,
  assignKnowledgeRoleMock,
  revokeKnowledgeRoleMock,
  searchMirrorMock,
  writeSharedKnowledgeMock,
  searchSharedKnowledgeMock,
} = vi.hoisted(() => ({
  ensureSharedKnowledgeTablesMock: vi.fn(async () => {}),
  seedKnowledgeRolesMock: vi.fn(async () => {}),
  agentHasRoleMock: vi.fn(async () => false),
  listKnowledgeRolesMock: vi.fn(async () => []),
  assignKnowledgeRoleMock: vi.fn(async () => ({ created: true })),
  revokeKnowledgeRoleMock: vi.fn(async () => ({ deleted: true })),
  searchMirrorMock: vi.fn(async () => ({ rows: [], errors: [] })),
  writeSharedKnowledgeMock: vi.fn(async () => ({
    knowledgeId: "k1",
    ownerAgentId: "main",
    visibility: "shared",
    visibleTo: [],
    editableBy: [],
    title: "title",
    content: "content",
    sourceMirrorIds: [],
    tags: ["ops"],
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  })),
  searchSharedKnowledgeMock: vi.fn(async () => []),
}));

vi.mock("../src/mirror/pg-reader.js", () => ({
  ensureSharedKnowledgeTables: ensureSharedKnowledgeTablesMock,
  seedKnowledgeRoles: seedKnowledgeRolesMock,
  agentHasRole: agentHasRoleMock,
  listKnowledgeRoles: listKnowledgeRolesMock,
  assignKnowledgeRole: assignKnowledgeRoleMock,
  revokeKnowledgeRole: revokeKnowledgeRoleMock,
  searchMirror: searchMirrorMock,
  writeSharedKnowledge: writeSharedKnowledgeMock,
  searchSharedKnowledge: searchSharedKnowledgeMock,
}));

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

function makeDeps(): LcmDependencies {
  return {
    config: {
      enabled: true,
      databasePath: ":memory:",
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
    },
    mirrorConfig: {
      enabled: true,
      databaseUrl: "postgresql://default:test@localhost:5432/lcm",
      agentDatabaseUrls: {
        main: "postgresql://main:test@localhost:5432/lcm_main",
        research: "postgresql://research:test@localhost:5432/lcm_research",
      },
      mode: "latest_nodes",
      maxNodes: 5,
      queueConcurrency: 1,
      maxRetries: 3,
      sharedKnowledgeEnabled: true,
      assembleSharedKnowledge: true,
      assembleSharedKnowledgeMaxTokens: 2000,
      assembleSharedKnowledgeLimit: 5,
      assembleSharedKnowledgeTimeoutMs: 500,
      adminRoleName: "admin",
      bootstrapAdminAgentIds: ["main"],
      roleBootstrapMap: {
        main: ["admin"],
        research: ["researcher"],
        email: ["personal-ops"],
      },
    },
    complete: vi.fn(async () => ({ content: [{ type: "text", text: "" }] })),
    callGateway: vi.fn(async () => ({})),
    resolveModel: vi.fn(() => ({ provider: "anthropic", model: "claude-sonnet-4-6" })),
    getApiKey: vi.fn(async () => undefined),
    requireApiKey: vi.fn(async () => "key"),
    parseAgentSessionKey,
    isSubagentSessionKey: () => false,
    normalizeAgentId: (id?: string) => (id?.trim() ? id.trim() : "main"),
    buildSubagentSystemPrompt: () => "subagent",
    readLatestAssistantReply: () => undefined,
    resolveAgentDir: () => "/tmp",
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

function makeLcmStub() {
  return {
    timezone: "UTC",
    getConversationStore: () => ({
      getConversationForSession: vi.fn(async () => null),
      getConversationBySessionId: vi.fn(async () => null),
      getConversationBySessionKey: vi.fn(async () => null),
    }),
  };
}

beforeEach(() => {
  ensureSharedKnowledgeTablesMock.mockClear();
  seedKnowledgeRolesMock.mockClear();
  agentHasRoleMock.mockReset();
  listKnowledgeRolesMock.mockReset();
  assignKnowledgeRoleMock.mockReset();
  revokeKnowledgeRoleMock.mockReset();
  searchMirrorMock.mockReset();
  writeSharedKnowledgeMock.mockReset();
  searchSharedKnowledgeMock.mockReset();
  agentHasRoleMock.mockResolvedValue(false);
  listKnowledgeRolesMock.mockResolvedValue([]);
  assignKnowledgeRoleMock.mockResolvedValue({ created: true });
  revokeKnowledgeRoleMock.mockResolvedValue({ deleted: true });
  searchMirrorMock.mockResolvedValue({ rows: [], errors: [] });
  writeSharedKnowledgeMock.mockResolvedValue({
    knowledgeId: "k1",
    ownerAgentId: "main",
    visibility: "shared",
    visibleTo: [],
    editableBy: [],
    title: "title",
    content: "content",
    sourceMirrorIds: [],
    tags: ["ops"],
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  });
  searchSharedKnowledgeMock.mockResolvedValue([]);
});

describe("M4 tools", () => {
  it("lcm_manage_roles fails closed when caller identity is unknown", async () => {
    const tool = createLcmManageRolesTool({
      deps: makeDeps(),
      lcm: makeLcmStub() as never,
    });
    const result = await tool.execute("call-1", { action: "list" });
    expect((result.details as { error?: string }).error).toContain("Caller identity could not be resolved");
  });

  it("lcm_manage_roles assigns role for admin caller", async () => {
    agentHasRoleMock.mockResolvedValue(true);
    const tool = createLcmManageRolesTool({
      deps: makeDeps(),
      lcm: makeLcmStub() as never,
      sessionKey: "agent:main:main",
    });
    const result = await tool.execute("call-2", {
      action: "assign",
      agentId: "research",
      roleGroup: "researcher",
    });
    expect(assignKnowledgeRoleMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agentId: "research",
        role: "researcher",
      }),
    );
    expect((result.details as { created?: boolean }).created).toBe(true);
  });

  it("lcm_shared_knowledge_write rejects agent-id-shaped ACL entries", async () => {
    agentHasRoleMock.mockResolvedValue(true);
    const tool = createLcmSharedKnowledgeWriteTool({
      deps: makeDeps(),
      lcm: makeLcmStub() as never,
      sessionKey: "agent:main:main",
    });
    const result = await tool.execute("call-3", {
      content: "hello",
      visibility: "restricted",
      visibleTo: ["agent:research:main"],
    });
    expect((result.details as { error?: string }).error).toContain("role-group names");
    expect(writeSharedKnowledgeMock).not.toHaveBeenCalled();
  });

  it("lcm_shared_knowledge_search runs role-filtered query for caller", async () => {
    searchSharedKnowledgeMock.mockResolvedValue([
      {
        knowledgeId: "k2",
        ownerAgentId: "main",
        visibility: "restricted",
        visibleTo: ["researcher"],
        editableBy: [],
        title: "Rate Limit",
        content: "API rate limit is 100 req/min",
        sourceMirrorIds: [],
        tags: ["api"],
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
    ]);
    const tool = createLcmSharedKnowledgeSearchTool({
      deps: makeDeps(),
      lcm: makeLcmStub() as never,
      sessionKey: "agent:research:main",
    });
    const result = await tool.execute("call-4", { query: "rate", limit: 5 });
    expect(searchSharedKnowledgeMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agentId: "research",
        query: "rate",
        limit: 5,
      }),
    );
    expect((result.content[0] as { text: string }).text).toContain("Rate Limit");
  });

  it("lcm_mirror_search enforces admin check and formats result table", async () => {
    agentHasRoleMock.mockResolvedValue(true);
    searchMirrorMock.mockResolvedValue({
      rows: [
        {
          mirrorId: "m1",
          sessionKey: "agent:research:main",
          conversationId: 42,
          agentId: "research",
          mode: "latest_nodes",
          content: "Compacted summary for release risk",
          capturedAt: new Date("2026-03-03T00:00:00.000Z"),
          sourceUrl: "postgresql://main:test@localhost:5432/lcm_main",
        },
      ],
      errors: [],
    });
    const tool = createLcmMirrorSearchTool({
      deps: makeDeps(),
      lcm: makeLcmStub() as never,
      sessionKey: "agent:main:main",
    });
    const result = await tool.execute("call-5", { query: "release", limit: 20 });
    expect(searchMirrorMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "postgresql://default:test@localhost:5432/lcm",
        "postgresql://main:test@localhost:5432/lcm_main",
      ]),
      expect.objectContaining({
        query: "release",
        limit: 20,
      }),
    );
    expect((result.content[0] as { text: string }).text).toContain("| captured_at | agent_id |");
    expect((result.content[0] as { text: string }).text).toContain("research");
  });

  it("lcm_mirror_search surfaces partial mirror failures in output and details", async () => {
    agentHasRoleMock.mockResolvedValue(true);
    const deps = makeDeps();
    searchMirrorMock.mockResolvedValue({
      rows: [],
      errors: [
        {
          sourceUrl: "postgresql://invalid-host:5432/lcm_bad",
          message: "connect ECONNREFUSED",
        },
      ],
    });
    const tool = createLcmMirrorSearchTool({
      deps,
      lcm: makeLcmStub() as never,
      sessionKey: "agent:main:main",
    });
    const result = await tool.execute("call-6", { query: "release", limit: 20 });
    expect((result.content[0] as { text: string }).text).toContain("partial_failures=1");
    expect((result.content[0] as { text: string }).text).toContain(
      "postgresql://invalid-host:5432/lcm_bad",
    );
    expect((result.details as { errors?: unknown[] }).errors).toHaveLength(1);
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("lcm_mirror_search partial failure on postgresql://invalid-host:5432/lcm_bad"),
    );
  });

  it("lcm_mirror_search uses bootstrap admin ids when shared knowledge is disabled", async () => {
    const deps = makeDeps();
    deps.mirrorConfig.sharedKnowledgeEnabled = false;
    deps.mirrorConfig.assembleSharedKnowledge = false;
    searchMirrorMock.mockResolvedValue({
      rows: [
        {
          mirrorId: "m2",
          sessionKey: "agent:main:main",
          conversationId: 43,
          agentId: "main",
          mode: "latest_nodes",
          content: "Mirror-only admin path",
          capturedAt: new Date("2026-03-03T01:00:00.000Z"),
          sourceUrl: "postgresql://default:test@localhost:5432/lcm",
        },
      ],
      errors: [],
    });
    const tool = createLcmMirrorSearchTool({
      deps,
      lcm: makeLcmStub() as never,
      sessionKey: "agent:main:main",
    });
    const result = await tool.execute("call-7", { query: "mirror-only", limit: 10 });
    expect(agentHasRoleMock).not.toHaveBeenCalled();
    expect((result.content[0] as { text: string }).text).toContain("Mirror-only admin path");
  });

  it("lcm_mirror_search denies non-bootstrap caller when shared knowledge is disabled", async () => {
    const deps = makeDeps();
    deps.mirrorConfig.sharedKnowledgeEnabled = false;
    deps.mirrorConfig.assembleSharedKnowledge = false;
    const tool = createLcmMirrorSearchTool({
      deps,
      lcm: makeLcmStub() as never,
      sessionKey: "agent:research:main",
    });
    const result = await tool.execute("call-8", { query: "release", limit: 10 });
    expect((result.details as { error?: string }).error).toContain("LCM_ADMIN_AGENT_IDS");
    expect(agentHasRoleMock).not.toHaveBeenCalled();
  });
});
