import { Type } from "@sinclair/typebox";
import type { LcmContextEngine } from "../engine.js";
import {
  agentHasRole,
  ensureSharedKnowledgeTables,
  seedKnowledgeRoles,
  writeSharedKnowledge,
} from "../mirror/pg-reader.js";
import { resolveSharedKnowledgeDatabaseUrl } from "../mirror/config.js";
import type { LcmDependencies } from "../types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import {
  normalizeRoleGroupList,
  normalizeUuidList,
  resolveCallerIdentity,
} from "./lcm-shared-auth.js";

const SharedKnowledgeWriteSchema = Type.Object({
  content: Type.String({
    description: "Knowledge content text.",
  }),
  title: Type.Optional(
    Type.String({
      description: "Optional knowledge title.",
    }),
  ),
  visibility: Type.Optional(
    Type.String({
      enum: ["shared", "restricted", "private"],
      description: "Visibility mode. Default: shared.",
    }),
  ),
  visibleTo: Type.Optional(
    Type.Array(
      Type.String({
        description: "Role-group names allowed to read restricted rows.",
      }),
    ),
  ),
  editableBy: Type.Optional(
    Type.Array(
      Type.String({
        description: "Role-group names allowed to update/delete.",
      }),
    ),
  ),
  tags: Type.Optional(
    Type.Array(
      Type.String({
        description: "Freeform tags.",
      }),
    ),
  ),
  sourceMirrorIds: Type.Optional(
    Type.Array(
      Type.String({
        description: "Optional source mirror UUID references.",
      }),
    ),
  ),
});

export function createLcmSharedKnowledgeWriteTool(input: {
  deps: LcmDependencies;
  lcm: LcmContextEngine;
  sessionId?: string;
  sessionKey?: string;
}): AnyAgentTool {
  return {
    name: "lcm_shared_knowledge_write",
    label: "LCM Shared Knowledge Write",
    description:
      "Admin-only write tool for shared knowledge entries with role-group based visibility/edit ACLs.",
    parameters: SharedKnowledgeWriteSchema,
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
              "Caller identity could not be resolved from session context. Admin tools require a parseable agent session key.",
          });
        }

        const isAdmin = await agentHasRole(connectionString, {
          agentId: caller.agentId,
          role: input.deps.mirrorConfig.adminRoleName,
        });
        if (!isAdmin) {
          return jsonResult({
            error: `Access denied: '${caller.agentId}' does not have admin role '${input.deps.mirrorConfig.adminRoleName}'.`,
          });
        }

        const params = rawParams as Record<string, unknown>;
        const content = typeof params.content === "string" ? params.content.trim() : "";
        if (!content) {
          return jsonResult({
            error: "content is required.",
          });
        }

        const visibility =
          params.visibility === "restricted" || params.visibility === "private"
            ? params.visibility
            : "shared";
        const visibleTo = normalizeRoleGroupList(params.visibleTo, "visibleTo");
        const editableBy = normalizeRoleGroupList(params.editableBy, "editableBy");
        const tags = (Array.isArray(params.tags) ? params.tags : [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);
        const sourceMirrorIds = normalizeUuidList(params.sourceMirrorIds, "sourceMirrorIds");

        if (visibility === "restricted" && visibleTo.length === 0) {
          return jsonResult({
            error: "visibleTo is required when visibility='restricted'.",
          });
        }

        const row = await writeSharedKnowledge(connectionString, {
          agentId: caller.agentId,
          adminRoleName: input.deps.mirrorConfig.adminRoleName,
          title: typeof params.title === "string" ? params.title.trim() : undefined,
          content,
          visibility,
          visibleTo,
          editableBy,
          tags,
          sourceMirrorIds,
        });

        return jsonResult({
          ok: true,
          knowledgeId: row.knowledgeId,
          ownerAgentId: row.ownerAgentId,
          visibility: row.visibility,
          visibleTo: row.visibleTo,
          editableBy: row.editableBy,
          tags: row.tags,
        });
      } catch (error) {
        return jsonResult({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
