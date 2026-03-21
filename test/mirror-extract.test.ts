import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runLcmMigrations } from "../src/db/migration.js";
import { getLcmDbFeatures } from "../src/db/features.js";
import { ConversationStore } from "../src/store/conversation-store.js";
import { SummaryStore } from "../src/store/summary-store.js";
import { extractMirrorPayload } from "../src/mirror/extract.js";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const { fts5Available } = getLcmDbFeatures(db);
  runLcmMigrations(db, { fts5Available });
  return db;
}

describe("extractMirrorPayload", () => {
  it("returns null when conversation has no summaries", async () => {
    const db = createTestDb();
    const convStore = new ConversationStore(db, { fts5Available: false });
    const sumStore = new SummaryStore(db, { fts5Available: false });
    const conv = await convStore.getOrCreateConversation("sid-1", { sessionKey: "agent:main:main" });
    const row = await extractMirrorPayload({
      summaryStore: sumStore,
      conversationId: conv.conversationId,
      sessionKey: "agent:main:main",
      sessionId: "sid-1",
      agentId: "main",
      mode: "latest_nodes",
      maxNodes: 5,
    });
    expect(row).toBeNull();
  });

  it("latest_nodes takes last N summaries by created order", async () => {
    const db = createTestDb();
    const convStore = new ConversationStore(db, { fts5Available: false });
    const sumStore = new SummaryStore(db, { fts5Available: false });
    const conv = await convStore.getOrCreateConversation("sid-1", { sessionKey: "agent:x:main" });

    await sumStore.insertSummary({
      summaryId: "sum_a",
      conversationId: conv.conversationId,
      kind: "leaf",
      content: "first",
      tokenCount: 1,
    });
    await sumStore.insertSummary({
      summaryId: "sum_b",
      conversationId: conv.conversationId,
      kind: "leaf",
      content: "second",
      tokenCount: 1,
    });
    await sumStore.insertSummary({
      summaryId: "sum_c",
      conversationId: conv.conversationId,
      kind: "leaf",
      content: "third",
      tokenCount: 1,
    });

    const row = await extractMirrorPayload({
      summaryStore: sumStore,
      conversationId: conv.conversationId,
      sessionKey: "agent:x:main",
      sessionId: "sid-1",
      agentId: "x",
      mode: "latest_nodes",
      maxNodes: 2,
    });
    expect(row).not.toBeNull();
    expect(row!.summaryIds).toEqual(["sum_b", "sum_c"]);
    expect(row!.content).toContain("second");
    expect(row!.content).toContain("third");
    expect(row!.content).not.toContain("first");
    expect(row!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("root_view follows context_items summary order", async () => {
    const db = createTestDb();
    const convStore = new ConversationStore(db, { fts5Available: false });
    const sumStore = new SummaryStore(db, { fts5Available: false });
    const conv = await convStore.getOrCreateConversation("sid-1", { sessionKey: "agent:main:main" });

    await sumStore.insertSummary({
      summaryId: "sum_1",
      conversationId: conv.conversationId,
      kind: "leaf",
      content: "alpha",
      tokenCount: 1,
    });
    await sumStore.insertSummary({
      summaryId: "sum_2",
      conversationId: conv.conversationId,
      kind: "leaf",
      content: "beta",
      tokenCount: 1,
    });
    await sumStore.appendContextSummary(conv.conversationId, "sum_2");
    await sumStore.appendContextSummary(conv.conversationId, "sum_1");

    const row = await extractMirrorPayload({
      summaryStore: sumStore,
      conversationId: conv.conversationId,
      sessionKey: "agent:main:main",
      sessionId: "sid-1",
      agentId: "main",
      mode: "root_view",
      maxNodes: 5,
    });
    expect(row).not.toBeNull();
    expect(row!.summaryIds).toEqual(["sum_2", "sum_1"]);
    const betaIdx = row!.content.indexOf("beta");
    const alphaIdx = row!.content.indexOf("alpha");
    expect(betaIdx).toBeGreaterThanOrEqual(0);
    expect(alphaIdx).toBeGreaterThan(betaIdx);
  });
});
