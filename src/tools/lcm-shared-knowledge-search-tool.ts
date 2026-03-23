import { Type } from "@sinclair/typebox";
import type { LcmContextEngine } from "../engine.js";
import {
  ensureSharedKnowledgeTables,
  searchSharedKnowledge,
  seedKnowledgeRoles,
} from "../mirror/pg-reader.js";
import { resolveSharedKnowledgeDatabaseUrl } from "../mirror/config.js";
import { formatTimestamp } from "../compaction.js";
import type { LcmDependencies } from "../types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import { resolveCallerIdentity } from "./lcm-shared-auth.js";

const SharedKnowledgeSearchSchema = Type.Object({
  query: Type.String({
    description: "Keyword query for shared knowledge title/content.",
  }),
  tags: Type.Optional(
    Type.Array(
      Type.String({
        description: "Tag filter with AND semantics.",
      }),
    ),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Max results (default 10, max 100).",
      minimum: 1,
      maximum: 100,
    }),
  ),
});

function truncate(content: string, maxLen: number = 260): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) {
    return compact;
  }
  return `${compact.slice(0, maxLen - 3)}...`;
}

export function createLcmSharedKnowledgeSearchTool(input: {
  deps: LcmDependencies;
  lcm: LcmContextEngine;
  sessionId?: string;
  sessionKey?: string;
}): AnyAgentTool {
  return {
    name: "lcm_shared_knowledge_search",
    label: "LCM Shared Knowledge Search",
    description:
      "Search shared knowledge entries. Results are filtered by PostgreSQL RLS and caller role membership.",
    parameters: SharedKnowledgeSearchSchema,
    async execute(_toolCallId, rawParams) {
      try {
        if (!input.deps.mirrorConfig.enabled || !input.deps.mirrorConfig.sharedKnowledgeEnabled) {
          return jsonResult({
            error: "Shared knowledge is disabled.",
          });
        }

        const connectionString = resolveSharedKnowledgeDatabaseUrl(input.deps.mirrorConfig);
        if (!connectionString) {
          return jsonResult({
            error:
              "No shared knowledge database URL resolved. Set LCM_MIRROR_DATABASE_URL or mirrorAgentDatabaseUrls.main.",
          });
        }

        await ensureSharedKnowledgeTables(connectionString);
        await seedKnowledgeRoles(connectionString, input.deps.mirrorConfig.roleBootstrapMap);

        const caller = await resolveCallerIdentity({
          deps: input.deps,
          lcm: input.lcm,
          sessionId: input.sessionId,
          sessionKey: input.sessionKey,
        });
        if (!caller) {
          return jsonResult({
            error:
              "Caller identity could not be resolved from session context. Shared knowledge search requires a parseable agent session key.",
          });
        }

        const params = rawParams as Record<string, unknown>;
        const query = typeof params.query === "string" ? params.query.trim() : "";
        if (!query) {
          return jsonResult({
            error: "query is required.",
          });
        }
        const tags = (Array.isArray(params.tags) ? params.tags : [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);
        const limit = typeof params.limit === "number" ? Math.trunc(params.limit) : 10;

        const rows = await searchSharedKnowledge(connectionString, {
          agentId: caller.agentId,
          adminRoleName: input.deps.mirrorConfig.adminRoleName,
          query,
          tags,
          limit,
        });

        const lines: string[] = [];
        lines.push("## Shared Knowledge Search");
        lines.push(`query=\`${query}\``);
        lines.push(`results=${rows.length}`);
        lines.push("");
        if (rows.length === 0) {
          lines.push("No matching shared knowledge found.");
        } else {
          lines.push("| updated_at | visibility | owner | title | tags | snippet |");
          lines.push("|---|---|---|---|---|---|");
          for (const row of rows) {
            lines.push(
              `| ${formatTimestamp(row.updatedAt, input.lcm.timezone)} | ${row.visibility} | ${row.ownerAgentId} | ${
                row.title?.trim() || "-"
              } | ${row.tags.join(", ") || "-"} | ${truncate(row.content)} |`,
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
