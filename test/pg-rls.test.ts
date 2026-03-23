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

describePg("shared knowledge RLS integration (requires TEST_PG_URL)", () => {
  afterAll(async () => {
    resetSharedKnowledgeEnsureCacheForTests();
    await closeAllMirrorPools();
  });

  it("restricted rows are visible only to matching role members", async () => {
    const runId = Date.now().toString(36);
    const adminAgent = `main_${runId}`;
    const researchAgent = `research_${runId}`;
    const emailAgent = `email_${runId}`;

    await ensureSharedKnowledgeTables(pgUrl!);
    await seedKnowledgeRoles(pgUrl!, {
      [adminAgent]: ["admin"],
      [researchAgent]: ["researcher"],
      [emailAgent]: ["personal-ops"],
    });

    await writeSharedKnowledge(pgUrl!, {
      agentId: adminAgent,
      adminRoleName: "admin",
      content: `Restricted finding ${runId}`,
      title: `Restricted ${runId}`,
      visibility: "restricted",
      visibleTo: ["researcher"],
      editableBy: ["admin"],
      tags: [runId],
    });

    const asResearch = await searchSharedKnowledge(pgUrl!, {
      agentId: researchAgent,
      adminRoleName: "admin",
      query: runId,
      limit: 10,
    });
    expect(asResearch.some((row) => row.tags.includes(runId))).toBe(true);

    const asEmail = await searchSharedKnowledge(pgUrl!, {
      agentId: emailAgent,
      adminRoleName: "admin",
      query: runId,
      limit: 10,
    });
    expect(asEmail.some((row) => row.tags.includes(runId))).toBe(false);

    await assignKnowledgeRole(pgUrl!, { agentId: emailAgent, role: "researcher" });
    const asEmailAfterRoleGrant = await searchSharedKnowledge(pgUrl!, {
      agentId: emailAgent,
      adminRoleName: "admin",
      query: runId,
      limit: 10,
    });
    expect(asEmailAfterRoleGrant.some((row) => row.tags.includes(runId))).toBe(true);
  });
});
