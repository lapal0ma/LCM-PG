import { Type } from "@sinclair/typebox";
import type { LcmContextEngine } from "../engine.js";
import {
  agentHasRole,
  assignKnowledgeRole,
  ensureSharedKnowledgeTables,
  listKnowledgeRoles,
  revokeKnowledgeRole,
  seedKnowledgeRoles,
} from "../mirror/pg-reader.js";
import { resolveSharedKnowledgeDatabaseUrl } from "../mirror/config.js";
import type { LcmDependencies } from "../types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import {
  normalizeAgentId,
  normalizeRoleGroupName,
  resolveCallerIdentity,
} from "./lcm-shared-auth.js";

const ManageRolesSchema = Type.Object({
  action: Type.String({
    enum: ["list", "assign", "revoke"],
    description: "Role operation: list, assign, or revoke.",
  }),
  agentId: Type.Optional(
    Type.String({
      description: "Target agent ID for assign/revoke.",
    }),
  ),
  role: Type.Optional(
    Type.String({
      description: "Role-group name for assign/revoke.",
    }),
  ),
  roleGroup: Type.Optional(
    Type.String({
      description: "Alias of role. Preferred field for assign/revoke.",
    }),
  ),
});

export function createLcmManageRolesTool(input: {
  deps: LcmDependencies;
  lcm: LcmContextEngine;
  sessionId?: string;
  sessionKey?: string;
}): AnyAgentTool {
  return {
    name: "lcm_manage_roles",
    label: "LCM Manage Roles",
    description:
      "Admin-only role management for shared knowledge access. " +
      "List role assignments, assign a role-group to an agent, or revoke one.",
    parameters: ManageRolesSchema,
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
        const action = typeof params.action === "string" ? params.action : "";
        if (action === "list") {
          const rows = await listKnowledgeRoles(connectionString);
          const lines = [
            "## Knowledge Roles",
            `Total assignments: ${rows.length}`,
            "",
          ];
          if (rows.length === 0) {
            lines.push("No role assignments found.");
          } else {
            lines.push("| agent_id | role | granted_at |");
            lines.push("|---|---|---|");
            for (const row of rows) {
              lines.push(
                `| ${row.agentId} | ${row.role} | ${row.grantedAt.toISOString()} |`,
              );
            }
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details: { action, rows },
          };
        }

        if (action !== "assign" && action !== "revoke") {
          return jsonResult({
            error: "action must be one of: list, assign, revoke.",
          });
        }

        const targetAgentId = normalizeAgentId(params.agentId, "agentId");
        const roleName = normalizeRoleGroupName(
          params.roleGroup ?? params.role,
          params.roleGroup != null ? "roleGroup" : "role",
        );

        if (action === "assign") {
          const outcome = await assignKnowledgeRole(connectionString, {
            agentId: targetAgentId,
            role: roleName,
          });
          return jsonResult({
            ok: true,
            action,
            created: outcome.created,
            agentId: targetAgentId,
            role: roleName,
          });
        }

        const outcome = await revokeKnowledgeRole(connectionString, {
          agentId: targetAgentId,
          role: roleName,
        });
        return jsonResult({
          ok: true,
          action,
          deleted: outcome.deleted,
          agentId: targetAgentId,
          role: roleName,
        });
      } catch (error) {
        return jsonResult({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
