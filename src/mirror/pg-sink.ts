import type { LcmMirrorRow } from "./types.js";
import { closeAllPgPools, getOrCreatePgPool, loadPg } from "./pg-common.js";

const ensuredUrls = new Set<string>();

const DDL = `
CREATE TABLE IF NOT EXISTS lcm_mirror (
  mirror_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL,
  conversation_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'latest_nodes',
  content TEXT NOT NULL,
  summary_ids JSONB NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL,
  session_id TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, content_hash)
);

CREATE INDEX IF NOT EXISTS lcm_mirror_session_key_idx ON lcm_mirror (session_key, ingested_at DESC);
CREATE INDEX IF NOT EXISTS lcm_mirror_agent_idx ON lcm_mirror (agent_id, ingested_at DESC);
`.trim();

export async function ensureLcmMirrorTable(connectionString: string): Promise<void> {
  if (ensuredUrls.has(connectionString)) {
    return;
  }
  const pg = await loadPg();
  const pool = getOrCreatePgPool(pg, { connectionString });
  await pool.query(DDL);
  ensuredUrls.add(connectionString);
}

export async function upsertLcmMirrorRow(connectionString: string, row: LcmMirrorRow): Promise<void> {
  const pg = await loadPg();
  await ensureLcmMirrorTable(connectionString);
  const pool = getOrCreatePgPool(pg, { connectionString });
  await pool.query(
    `INSERT INTO lcm_mirror (
       session_key, conversation_id, agent_id, mode, content, summary_ids, content_hash, session_id, captured_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz)
     ON CONFLICT (conversation_id, content_hash) DO NOTHING`,
    [
      row.sessionKey,
      row.conversationId,
      row.agentId,
      row.mode,
      row.content,
      JSON.stringify(row.summaryIds),
      row.contentHash,
      row.sessionId ?? null,
      row.capturedAtIso,
    ],
  );
}

/** For tests / graceful shutdown of plugin process. */
export async function closeAllMirrorPools(): Promise<void> {
  await closeAllPgPools();
  ensuredUrls.clear();
}
