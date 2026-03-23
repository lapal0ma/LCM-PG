import type { LcmMirrorConfig, LcmMirrorMode } from "./types.js";

const DEFAULT_ADMIN_ROLE = "admin";
const DEFAULT_BOOTSTRAP_ADMIN_AGENT_IDS = ["main"];
const DEFAULT_ROLE_BOOTSTRAP_MAP: Record<string, string[]> = {
  main: [DEFAULT_ADMIN_ROLE],
  research: ["researcher"],
  email: ["personal-ops"],
};

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

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
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

function parseRoleBootstrapMapValue(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string[]> = {};
  for (const [rawAgentId, rawRoles] of Object.entries(value as Record<string, unknown>)) {
    const agentId = rawAgentId.trim();
    if (!agentId) {
      continue;
    }
    const roles = uniqueStrings(toStringArray(rawRoles));
    if (roles.length === 0) {
      continue;
    }
    out[agentId] = roles;
  }
  return out;
}

function parseRoleBootstrapMapJson(raw: string | undefined): Record<string, string[]> {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseRoleBootstrapMapValue(parsed);
  } catch {
    return {};
  }
}

function mergeRoleBootstrapMaps(
  base: Record<string, string[]>,
  extra: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const [agentId, roles] of Object.entries(base)) {
    merged[agentId] = uniqueStrings(roles);
  }
  for (const [agentId, roles] of Object.entries(extra)) {
    merged[agentId] = uniqueStrings([...(merged[agentId] ?? []), ...roles]);
  }
  return merged;
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

  const sharedKnowledgeEnabled =
    env.LCM_SHARED_KNOWLEDGE_ENABLED !== undefined
      ? env.LCM_SHARED_KNOWLEDGE_ENABLED === "true"
      : (toBool(pc.sharedKnowledgeEnabled ?? pc.mirrorSharedKnowledgeEnabled) ?? enabled);

  const rawAssembleSharedKnowledge =
    env.LCM_ASSEMBLE_SHARED_KNOWLEDGE !== undefined
      ? env.LCM_ASSEMBLE_SHARED_KNOWLEDGE === "true"
      : (toBool(pc.assembleSharedKnowledge ?? pc.mirrorAssembleSharedKnowledge) ?? true);

  const assembleSharedKnowledgeMaxTokens =
    (env.LCM_ASSEMBLE_SK_MAX_TOKENS !== undefined
      ? parseInt(env.LCM_ASSEMBLE_SK_MAX_TOKENS, 10)
      : undefined) ??
    toNumber(pc.assembleSkMaxTokens ?? pc.mirrorAssembleSkMaxTokens) ??
    2000;

  const assembleSharedKnowledgeLimit =
    (env.LCM_ASSEMBLE_SK_LIMIT !== undefined ? parseInt(env.LCM_ASSEMBLE_SK_LIMIT, 10) : undefined) ??
    toNumber(pc.assembleSkLimit ?? pc.mirrorAssembleSkLimit) ??
    5;

  const assembleSharedKnowledgeTimeoutMs =
    (env.LCM_ASSEMBLE_SK_TIMEOUT_MS !== undefined
      ? parseInt(env.LCM_ASSEMBLE_SK_TIMEOUT_MS, 10)
      : undefined) ??
    toNumber(pc.assembleSkTimeoutMs ?? pc.mirrorAssembleSkTimeoutMs) ??
    500;

  const adminRoleName =
    env.LCM_ADMIN_ROLE_NAME?.trim() ??
    toStr(pc.adminRoleName ?? pc.mirrorAdminRoleName) ??
    DEFAULT_ADMIN_ROLE;

  const bootstrapAdminAgentIds = uniqueStrings(
    env.LCM_ADMIN_AGENT_IDS !== undefined
      ? toStringArray(env.LCM_ADMIN_AGENT_IDS)
      : toStringArray(pc.mirrorAdminAgents ?? DEFAULT_BOOTSTRAP_ADMIN_AGENT_IDS),
  );

  const roleBootstrapMapFromEnv =
    env.LCM_ROLE_BOOTSTRAP_MAP !== undefined
      ? parseRoleBootstrapMapJson(env.LCM_ROLE_BOOTSTRAP_MAP)
      : {};
  const roleBootstrapMapFromConfig =
    env.LCM_ROLE_BOOTSTRAP_MAP !== undefined
      ? {}
      : parseRoleBootstrapMapValue(pc.roleBootstrapMap ?? pc.mirrorRoleBootstrapMap);
  const roleBootstrapMap = mergeRoleBootstrapMaps(
    mergeRoleBootstrapMaps(DEFAULT_ROLE_BOOTSTRAP_MAP, roleBootstrapMapFromConfig),
    roleBootstrapMapFromEnv,
  );
  const seededRoleBootstrapMap = { ...roleBootstrapMap };
  for (const agentId of bootstrapAdminAgentIds) {
    seededRoleBootstrapMap[agentId] = uniqueStrings([
      ...(seededRoleBootstrapMap[agentId] ?? []),
      adminRoleName,
    ]);
  }

  return {
    enabled,
    databaseUrl,
    agentDatabaseUrls,
    mode,
    maxNodes: Math.max(1, Math.min(50, Math.floor(maxNodes))),
    queueConcurrency: Math.max(1, Math.min(8, Math.floor(queueConcurrency))),
    maxRetries: Math.max(0, Math.min(10, Math.floor(maxRetries))),
    sharedKnowledgeEnabled: enabled && sharedKnowledgeEnabled,
    assembleSharedKnowledge: enabled && sharedKnowledgeEnabled && rawAssembleSharedKnowledge,
    assembleSharedKnowledgeMaxTokens: Math.max(
      200,
      Math.min(32_000, Math.floor(assembleSharedKnowledgeMaxTokens)),
    ),
    assembleSharedKnowledgeLimit: Math.max(1, Math.min(20, Math.floor(assembleSharedKnowledgeLimit))),
    assembleSharedKnowledgeTimeoutMs: Math.max(
      50,
      Math.min(30_000, Math.floor(assembleSharedKnowledgeTimeoutMs)),
    ),
    adminRoleName: adminRoleName.trim() || DEFAULT_ADMIN_ROLE,
    bootstrapAdminAgentIds:
      bootstrapAdminAgentIds.length > 0 ? bootstrapAdminAgentIds : [...DEFAULT_BOOTSTRAP_ADMIN_AGENT_IDS],
    roleBootstrapMap: seededRoleBootstrapMap,
  };
}

export function resolveMirrorDatabaseUrl(config: LcmMirrorConfig, agentId: string): string | undefined {
  const fromAgent = config.agentDatabaseUrls[agentId];
  if (fromAgent?.trim()) {
    return fromAgent.trim();
  }
  return config.databaseUrl?.trim();
}

export function resolveAllMirrorDatabaseUrls(config: LcmMirrorConfig): string[] {
  const urls = [
    config.databaseUrl?.trim(),
    ...Object.values(config.agentDatabaseUrls).map((value) => value.trim()),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return uniqueStrings(urls);
}

/**
 * Shared knowledge is global across agents, so we prefer the `main` URL.
 */
export function resolveSharedKnowledgeDatabaseUrl(config: LcmMirrorConfig): string | undefined {
  const mainUrl = config.agentDatabaseUrls.main?.trim();
  if (mainUrl) {
    return mainUrl;
  }
  const defaultUrl = config.databaseUrl?.trim();
  if (defaultUrl) {
    return defaultUrl;
  }
  const urls = resolveAllMirrorDatabaseUrls(config);
  return urls.length === 1 ? urls[0] : undefined;
}
