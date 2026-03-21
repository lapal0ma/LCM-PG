import type { LcmMirrorConfig, LcmMirrorMode } from "./types.js";

function toStr(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : undefined;
  }
  return undefined;
}

function toBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseAgentPgMapJson(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        out[k.trim()] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeMode(value: string | undefined): LcmMirrorMode {
  if (value === "root_view") {
    return "root_view";
  }
  return "latest_nodes";
}

/**
 * Mirror config: env wins over plugin config (same style as LCM core).
 */
export function resolveLcmMirrorConfig(
  env: NodeJS.ProcessEnv = process.env,
  pluginConfig?: Record<string, unknown>,
): LcmMirrorConfig {
  const pc = pluginConfig ?? {};

  const enabled =
    env.LCM_MIRROR_ENABLED !== undefined
      ? env.LCM_MIRROR_ENABLED === "true"
      : (toBool(pc.mirrorEnabled) ?? false);

  const databaseUrl =
    env.LCM_MIRROR_DATABASE_URL?.trim() ??
    toStr(pc.mirrorDatabaseUrl) ??
    toStr(pc.mirrorPostgresUrl);

  const agentDatabaseUrls =
    env.LCM_MIRROR_AGENT_PG_MAP !== undefined
      ? parseAgentPgMapJson(env.LCM_MIRROR_AGENT_PG_MAP)
      : typeof pc.mirrorAgentDatabaseUrls === "object" &&
          pc.mirrorAgentDatabaseUrls !== null &&
          !Array.isArray(pc.mirrorAgentDatabaseUrls)
        ? Object.fromEntries(
            Object.entries(pc.mirrorAgentDatabaseUrls as Record<string, unknown>)
              .filter(([, v]) => typeof v === "string" && (v as string).trim())
              .map(([k, v]) => [k.trim(), (v as string).trim()]),
          )
        : {};

  const mode = normalizeMode(
    env.LCM_MIRROR_MODE?.trim().toLowerCase() ?? toStr(pc.mirrorMode)?.toLowerCase(),
  );

  const maxNodes =
    (env.LCM_MIRROR_MAX_NODES !== undefined ? parseInt(env.LCM_MIRROR_MAX_NODES, 10) : undefined) ??
    toNumber(pc.mirrorMaxNodes) ??
    5;

  const queueConcurrency =
    (env.LCM_MIRROR_QUEUE_CONCURRENCY !== undefined
      ? parseInt(env.LCM_MIRROR_QUEUE_CONCURRENCY, 10)
      : undefined) ??
    toNumber(pc.mirrorQueueConcurrency) ??
    1;

  const maxRetries =
    (env.LCM_MIRROR_MAX_RETRIES !== undefined ? parseInt(env.LCM_MIRROR_MAX_RETRIES, 10) : undefined) ??
    toNumber(pc.mirrorMaxRetries) ??
    4;

  return {
    enabled,
    databaseUrl,
    agentDatabaseUrls,
    mode,
    maxNodes: Math.max(1, Math.min(50, Math.floor(maxNodes))),
    queueConcurrency: Math.max(1, Math.min(8, Math.floor(queueConcurrency))),
    maxRetries: Math.max(0, Math.min(10, Math.floor(maxRetries))),
  };
}

export function resolveMirrorDatabaseUrl(config: LcmMirrorConfig, agentId: string): string | undefined {
  const fromAgent = config.agentDatabaseUrls[agentId];
  if (fromAgent?.trim()) {
    return fromAgent.trim();
  }
  return config.databaseUrl?.trim();
}
