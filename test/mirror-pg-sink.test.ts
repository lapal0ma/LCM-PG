import { afterAll, describe, expect, it } from "vitest";
import {
  ensureLcmMirrorTable,
  upsertLcmMirrorRow,
  closeAllMirrorPools,
} from "../src/mirror/pg-sink.js";
import type { LcmMirrorRow } from "../src/mirror/types.js";

const pgUrl = process.env.TEST_PG_URL;
const describePg = pgUrl ? describe : describe.skip;

function makeRow(overrides?: Partial<LcmMirrorRow>): LcmMirrorRow {
  return {
    sessionKey: "agent:test:main",
    sessionId: "sid-integration-1",
    conversationId: 42,
    agentId: "test",
    mode: "latest_nodes",
    content: "Integration test summary content.",
    summaryIds: ["sum_a", "sum_b"],
    contentHash: "deadbeef".repeat(8),
    capturedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

describePg("pg-sink integration (requires TEST_PG_URL)", () => {
  afterAll(async () => {
    if (!pgUrl) return;
    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: pgUrl, max: 1 });
    await pool.query("DROP TABLE IF EXISTS lcm_mirror");
    await pool.end();
    await closeAllMirrorPools();
  });

  it("ensureLcmMirrorTable creates the table", async () => {
    await ensureLcmMirrorTable(pgUrl!);

    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: pgUrl!, max: 1 });
    const res = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'lcm_mirror'`,
    );
    await pool.end();

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].table_name).toBe("lcm_mirror");
  });

  it("upsertLcmMirrorRow inserts a row and all columns round-trip", async () => {
    const row = makeRow();
    await upsertLcmMirrorRow(pgUrl!, row);

    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: pgUrl!, max: 1 });
    const res = await pool.query(
      `SELECT session_key, conversation_id, agent_id, mode, content,
              summary_ids, content_hash, session_id, captured_at
       FROM lcm_mirror WHERE content_hash = $1`,
      [row.contentHash],
    );
    await pool.end();

    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.session_key).toBe(row.sessionKey);
    expect(Number(r.conversation_id)).toBe(row.conversationId);
    expect(r.agent_id).toBe(row.agentId);
    expect(r.mode).toBe(row.mode);
    expect(r.content).toBe(row.content);
    expect(r.summary_ids).toEqual(row.summaryIds);
    expect(r.content_hash).toBe(row.contentHash);
    expect(r.session_id).toBe(row.sessionId);
    expect(new Date(r.captured_at).toISOString()).toBe(row.capturedAtIso);
  });

  it("upsertLcmMirrorRow is idempotent (ON CONFLICT DO NOTHING)", async () => {
    const row = makeRow();
    await upsertLcmMirrorRow(pgUrl!, row);

    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: pgUrl!, max: 1 });
    const res = await pool.query(
      `SELECT count(*)::int AS cnt FROM lcm_mirror
       WHERE conversation_id = $1 AND content_hash = $2`,
      [row.conversationId, row.contentHash],
    );
    await pool.end();

    expect(res.rows[0].cnt).toBe(1);
  });

  it("upsertLcmMirrorRow inserts a second row with different content_hash", async () => {
    const row = makeRow({ contentHash: "cafebabe".repeat(8), content: "Different content." });
    await upsertLcmMirrorRow(pgUrl!, row);

    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: pgUrl!, max: 1 });
    const res = await pool.query(
      `SELECT count(*)::int AS cnt FROM lcm_mirror WHERE conversation_id = $1`,
      [row.conversationId],
    );
    await pool.end();

    expect(res.rows[0].cnt).toBe(2);
  });
});
