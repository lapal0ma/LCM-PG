/** How mirror text is derived from SQLite (see LCM-PG-fw-plan.md). */
export type LcmMirrorMode = "latest_nodes" | "root_view";

export type LcmMirrorConfig = {
  enabled: boolean;
  /** Single PostgreSQL URL when not using per-agent map. */
  databaseUrl: string | undefined;
  /** Optional `agentId` → connection string (overrides `databaseUrl`). */
  agentDatabaseUrls: Record<string, string>;
  mode: LcmMirrorMode;
  maxNodes: number;
  queueConcurrency: number;
  maxRetries: number;
};

/** Row sent to `lcm_mirror`. */
export type LcmMirrorRow = {
  sessionKey: string;
  sessionId: string | undefined;
  conversationId: number;
  agentId: string;
  mode: LcmMirrorMode;
  content: string;
  summaryIds: string[];
  contentHash: string;
  capturedAtIso: string;
};
