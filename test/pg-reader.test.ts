import { afterAll, describe, expect, it } from "vitest";
import {
  agentHasRole,
  assignKnowledgeRole,
  ensureSharedKnowledgeTables,
  listKnowledgeRoles,
  resetSharedKnowledgeEnsureCacheForTests,
  revokeKnowledgeRole,
  searchSharedKnowledge,
  seedKnowledgeRoles,
  writeSharedKnowledge,
} from "../src/mirror/pg-reader.js";
import { closeAllMirrorPools } from "../src/mirror/pg-sink.js";

const pgUrl = process.env.TEST_PG_URL;
const describePg = pgUrl ? describe : describe.skip;

describePg("pg-reader integration (requires TEST_PG_URL)", () => {
  afterAll(async () => {
    resetSharedKnowledgeEnsureCacheForTests();
    await closeAllMirrorPools();
  });

  it("ensureSharedKnowledgeTables creates role/knowledge tables", async () => {
    await ensureSharedKnowledgeTables(pgUrl!);
    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: pgUrl!, max: 1 });
    const result = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('knowledge_roles', 'shared_knowledge')
       ORDER BY table_name`,
    );
    await pool.end();
    expect(result.rows.map((row) => row.table_name)).toEqual(["knowledge_roles", "shared_knowledge"]);
  });

  it("role CRUD works and is idempotent", async () => {
    const runId = Date.now().toString(36);
    const agentId = `agent_${runId}`;
    await ensureSharedKnowledgeTables(pgUrl!);
    await assignKnowledgeRole(pgUrl!, { agentId, role: "researcher" });
    await assignKnowledgeRole(pgUrl!, { agentId, role: "researcher" });

    const hasRole = await agentHasRole(pgUrl!, { agentId, role: "researcher" });
    expect(hasRole).toBe(true);

    const list = await listKnowledgeRoles(pgUrl!);
    expect(list.some((row) => row.agentId === agentId && row.role === "researcher")).toBe(true);

    const revoke = await revokeKnowledgeRole(pgUrl!, { agentId, role: "researcher" });
    expect(revoke.deleted).toBe(true);
    const hasAfter = await agentHasRole(pgUrl!, { agentId, role: "researcher" });
    expect(hasAfter).toBe(false);
  });

  it("write/search shared knowledge respects role-based visibility", async () => {
    const runId = Date.now().toString(36);
    const adminAgent = `main_${runId}`;
    const researchAgent = `research_${runId}`;
    await ensureSharedKnowledgeTables(pgUrl!);
    await seedKnowledgeRoles(pgUrl!, {
      [adminAgent]: ["admin"],
      [researchAgent]: ["researcher"],
    });

    await writeSharedKnowledge(pgUrl!, {
      agentId: adminAgent,
      adminRoleName: "admin",
      content: `API rate limit is 100 req/min (${runId})`,
      title: `Rate Limit ${runId}`,
      visibility: "restricted",
      visibleTo: ["researcher"],
      editableBy: ["admin"],
      tags: ["api", runId],
    });

    const asResearch = await searchSharedKnowledge(pgUrl!, {
      agentId: researchAgent,
      adminRoleName: "admin",
      query: runId,
      limit: 10,
    });
    expect(asResearch.length).toBeGreaterThan(0);
    expect(asResearch.some((row) => row.tags.includes(runId))).toBe(true);
  });
});
