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
  /** Enable shared knowledge + role tools. */
  sharedKnowledgeEnabled: boolean;
  /** Enable assemble-time shared knowledge injection. */
  assembleSharedKnowledge: boolean;
  /** Max token budget for assemble injected shared knowledge block. */
  assembleSharedKnowledgeMaxTokens: number;
  /** Max number of entries for assemble injected shared knowledge block. */
  assembleSharedKnowledgeLimit: number;
  /** Hard timeout (ms) for assemble shared knowledge lookup. */
  assembleSharedKnowledgeTimeoutMs: number;
  /** Runtime admin role name. */
  adminRoleName: string;
  /** Legacy bootstrap admin ids used for first-run seeding. */
  bootstrapAdminAgentIds: string[];
  /** Default role bootstrap mapping. */
  roleBootstrapMap: Record<string, string[]>;
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
