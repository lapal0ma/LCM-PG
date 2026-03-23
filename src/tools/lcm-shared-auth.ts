import type { LcmContextEngine } from "../engine.js";
import type { LcmDependencies } from "../types.js";

type ConversationStoreLike = ReturnType<LcmContextEngine["getConversationStore"]> & {
  getConversationForSession?: (input: {
    sessionId?: string;
    sessionKey?: string;
  }) => Promise<{ sessionKey?: string | null } | null>;
  getConversationBySessionId?: (sessionId: string) => Promise<{ sessionKey?: string | null } | null>;
  getConversationBySessionKey?: (sessionKey: string) => Promise<{ sessionKey?: string | null } | null>;
};

const ROLE_GROUP_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unique(values: string[]): string[] {
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

function parseList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function looksLikeAgentIdShape(value: string): boolean {
  if (!value) {
    return false;
  }
  if (value.startsWith("agent:")) {
    return true;
  }
  return value.includes(":");
}

async function lookupConversation(input: {
  lcm: LcmContextEngine;
  sessionId?: string;
  sessionKey?: string;
}): Promise<{ sessionKey?: string | null } | null> {
  const store = input.lcm.getConversationStore() as ConversationStoreLike;
  if (typeof store.getConversationForSession === "function") {
    return store.getConversationForSession({
      sessionId: input.sessionId,
      sessionKey: input.sessionKey,
    });
  }

  const normalizedSessionKey = input.sessionKey?.trim();
  if (normalizedSessionKey && typeof store.getConversationBySessionKey === "function") {
    const byKey = await store.getConversationBySessionKey(normalizedSessionKey);
    if (byKey) {
      return byKey;
    }
  }

  const normalizedSessionId = input.sessionId?.trim();
  if (!normalizedSessionId || typeof store.getConversationBySessionId !== "function") {
    return null;
  }
  return store.getConversationBySessionId(normalizedSessionId);
}

export async function resolveCallerIdentity(input: {
  deps: Pick<LcmDependencies, "parseAgentSessionKey" | "normalizeAgentId">;
  lcm: LcmContextEngine;
  sessionKey?: string;
  sessionId?: string;
}): Promise<{ agentId: string; sessionKey: string } | null> {
  const candidates: string[] = [];
  const providedSessionKey = input.sessionKey?.trim();
  if (providedSessionKey) {
    candidates.push(providedSessionKey);
  }

  const conversation = await lookupConversation({
    lcm: input.lcm,
    sessionId: input.sessionId?.trim() || undefined,
    sessionKey: providedSessionKey,
  });
  const storedSessionKey =
    typeof conversation?.sessionKey === "string" ? conversation.sessionKey.trim() : "";
  if (storedSessionKey && !candidates.includes(storedSessionKey)) {
    candidates.push(storedSessionKey);
  }

  for (const candidate of candidates) {
    const parsed = input.deps.parseAgentSessionKey(candidate);
    const agentId = parsed?.agentId?.trim();
    if (!agentId) {
      continue;
    }
    return {
      agentId: input.deps.normalizeAgentId(agentId),
      sessionKey: candidate,
    };
  }
  return null;
}

export function normalizeRoleGroupList(
  value: unknown,
  fieldName: string,
): string[] {
  const parsed = unique(parseList(value));
  for (const role of parsed) {
    if (looksLikeAgentIdShape(role)) {
      throw new Error(
        `${fieldName} only accepts role-group names (not session keys or agent-id-shaped values).`,
      );
    }
    if (!ROLE_GROUP_NAME_PATTERN.test(role)) {
      throw new Error(
        `${fieldName} contains invalid role-group '${role}'. Use lowercase letters, numbers, '-' or '_'.`,
      );
    }
  }
  return parsed;
}

export function normalizeRoleGroupName(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  const role = value.trim();
  if (looksLikeAgentIdShape(role)) {
    throw new Error(`${fieldName} must be a role-group name, not an agent identifier.`);
  }
  if (!ROLE_GROUP_NAME_PATTERN.test(role)) {
    throw new Error(
      `${fieldName} must use lowercase letters, numbers, '-' or '_' and start with a letter.`,
    );
  }
  return role;
}

export function normalizeAgentId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  const agentId = value.trim();
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return agentId;
}

export function normalizeUuidList(value: unknown, fieldName: string): string[] {
  const parsed = unique(parseList(value));
  for (const id of parsed) {
    if (!UUID_PATTERN.test(id)) {
      throw new Error(`${fieldName} contains non-UUID value '${id}'.`);
    }
  }
  return parsed;
}
