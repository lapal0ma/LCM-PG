import { afterAll, describe, expect, it } from "vitest";
import {
  assignKnowledgeRole,
  ensureSharedKnowledgeTables,
  resetSharedKnowledgeEnsureCacheForTests,
  searchSharedKnowledge,
  seedKnowledgeRoles,
  writeSharedKnowledge,
} from "../src/mirror/pg-reader.js";
import { closeAllMirrorPools } from "../src/mirror/pg-sink.js";

const pgUrl = process.env.TEST_PG_URL;
const describePg = pgUrl ? describe : describe.skip;

describePg("shared knowledge e2e (requires TEST_PG_URL)", () => {
  afterAll(async () => {
    resetSharedKnowledgeEnsureCacheForTests();
    await closeAllMirrorPools();
  });

  it("assign role -> write restricted -> role-matched read -> unmatched hidden", async () => {
    const runId = Date.now().toString(36);
    const adminAgent = `main_${runId}`;
    const researcherAgent = `research_${runId}`;
    const plainAgent = `plain_${runId}`;

    await ensureSharedKnowledgeTables(pgUrl!);
    await seedKnowledgeRoles(pgUrl!, {
      [adminAgent]: ["admin"],
    });
    await assignKnowledgeRole(pgUrl!, { agentId: researcherAgent, role: "researcher" });

    await writeSharedKnowledge(pgUrl!, {
      agentId: adminAgent,
      adminRoleName: "admin",
      content: `M4 e2e payload ${runId}`,
      title: `E2E ${runId}`,
      visibility: "restricted",
      visibleTo: ["researcher"],
      editableBy: ["admin"],
      tags: ["e2e", runId],
    });

    const researcherRows = await searchSharedKnowledge(pgUrl!, {
      agentId: researcherAgent,
      adminRoleName: "admin",
      query: runId,
      limit: 10,
    });
    expect(researcherRows.some((row) => row.tags.includes(runId))).toBe(true);

    const plainRows = await searchSharedKnowledge(pgUrl!, {
      agentId: plainAgent,
      adminRoleName: "admin",
      query: runId,
      limit: 10,
    });
    expect(plainRows.some((row) => row.tags.includes(runId))).toBe(false);
  });
});
