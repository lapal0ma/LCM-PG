import { Type } from "@sinclair/typebox";
import type { LcmContextEngine } from "../engine.js";
import {
  agentHasRole,
  ensureSharedKnowledgeTables,
  searchMirror,
  seedKnowledgeRoles,
} from "../mirror/pg-reader.js";
import {
  resolveAllMirrorDatabaseUrls,
  resolveSharedKnowledgeDatabaseUrl,
} from "../mirror/config.js";
import { formatTimestamp } from "../compaction.js";
import type { LcmDependencies } from "../types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import { parseIsoTimestampParam } from "./lcm-conversation-scope.js";
import { resolveCallerIdentity } from "./lcm-shared-auth.js";

const MirrorSearchSchema = Type.Object({
  query: Type.String({
    description: "Keyword search against mirrored summary content.",
  }),
  agentId: Type.Optional(
    Type.String({
      description: "Optional agent filter.",
    }),
  ),
  since: Type.Optional(
    Type.String({
      description: "ISO lower-bound timestamp for captured_at.",
    }),
  ),
  before: Type.Optional(
    Type.String({
      description: "ISO upper-bound timestamp for captured_at.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Max results (default 20, max 100).",
      minimum: 1,
      maximum: 100,
    }),
  ),
});

function truncate(content: string, maxLen: number = 220): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) {
    return compact;
  }
  return `${compact.slice(0, maxLen - 3)}...`;
}

export function createLcmMirrorSearchTool(input: {
  deps: LcmDependencies;
  lcm: LcmContextEngine;
  sessionId?: string;
  sessionKey?: string;
}): AnyAgentTool {
  return {
    name: "lcm_mirror_search",
    label: "LCM Mirror Search",
    description:
      "Admin-only search across PostgreSQL mirror rows. " +
      "Useful for finding compacted summaries by keyword/time/agent filters.",
    parameters: MirrorSearchSchema,
    async execute(_toolCallId, rawParams) {
      try {
        if (!input.deps.mirrorConfig.enabled) {
          return jsonResult({
            error: "PG mirror is disabled.",
          });
        }

        const caller = await resolveCallerIdentity({
          deps: input.deps,
          lcm: input.lcm,
          sessionId: input.sessionId,
          sessionKey: input.sessionKey,
        });
        if (!caller) {
          return jsonResult({
            error:
              "Caller identity could not be resolved from session context. Admin tools require a parseable agent session key.",
          });
        }

        const adminDbUrl = resolveSharedKnowledgeDatabaseUrl(input.deps.mirrorConfig);
        let isAdmin = input.deps.mirrorConfig.bootstrapAdminAgentIds.includes(caller.agentId);
        if (adminDbUrl && input.deps.mirrorConfig.sharedKnowledgeEnabled) {
          await ensureSharedKnowledgeTables(adminDbUrl);
          await seedKnowledgeRoles(adminDbUrl, input.deps.mirrorConfig.roleBootstrapMap);
          isAdmin = await agentHasRole(adminDbUrl, {
            agentId: caller.agentId,
            role: input.deps.mirrorConfig.adminRoleName,
          });
        }
        if (!isAdmin) {
          return jsonResult({
            error: `Access denied: '${caller.agentId}' does not have admin role '${input.deps.mirrorConfig.adminRoleName}'.`,
          });
        }

        const params = rawParams as Record<string, unknown>;
        const query = typeof params.query === "string" ? params.query.trim() : "";
        if (!query) {
          return jsonResult({
            error: "query is required.",
          });
        }
        const agentId = typeof params.agentId === "string" ? params.agentId.trim() || undefined : undefined;
        const limit = typeof params.limit === "number" ? Math.trunc(params.limit) : 20;
        const since = parseIsoTimestampParam(params, "since");
        const before = parseIsoTimestampParam(params, "before");
        if (since && before && since.getTime() >= before.getTime()) {
          return jsonResult({
            error: "`since` must be earlier than `before`.",
          });
        }

        const urls = resolveAllMirrorDatabaseUrls(input.deps.mirrorConfig);
        if (urls.length === 0) {
          return jsonResult({
            error: "No mirror PostgreSQL URLs configured.",
          });
        }

        const rows = await searchMirror(urls, {
          query,
          agentId,
          since,
          before,
          limit,
        });

        const lines: string[] = [];
        lines.push("## LCM Mirror Search");
        lines.push(`query=\`${query}\``);
        lines.push(`results=${rows.length}`);
        lines.push("");
        if (rows.length === 0) {
          lines.push("No mirror rows matched.");
        } else {
          lines.push(
            "| captured_at | agent_id | conversation_id | mode | snippet |",
          );
          lines.push("|---|---|---:|---|---|");
          for (const row of rows) {
            lines.push(
              `| ${formatTimestamp(row.capturedAt, input.lcm.timezone)} | ${row.agentId} | ${row.conversationId} | ${row.mode} | ${truncate(row.content)} |`,
            );
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { rows },
        };
      } catch (error) {
        return jsonResult({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
