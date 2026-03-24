---
name: lcm-pg-demo-operator
description: Operate LCM-PG in OpenClaw for multi-agent toB demos and cross-agent memory workflows. Use when you need reliable execution of lcm_mirror_search, lcm_manage_roles, lcm_shared_knowledge_write/search, and the lcm_grep -> lcm_describe -> lcm_expand_query recall ladder.
---

# LCM-PG Demo Operator

Use this skill when running an enterprise-style multi-agent demo with LCM-PG.

## Load these references first

- `docs/agent-tools.md` for LCM recall tools (`lcm_grep`, `lcm_describe`, `lcm_expand_query`)
- `README.md` for mirror/shared-knowledge config flags
- `docs/architecture.md` for compaction and assemble behavior
- `docs/tob-demo-macbook-runbook.md` for a full live script

## Follow this tool-selection ladder

1. Start with `lcm_grep` for fast discovery in current/all conversations.
2. Use `lcm_describe` for one summary/file when grep snippet is insufficient.
3. Use `lcm_expand_query` for exact details that summaries compress away.
4. Use `lcm_mirror_search` only for admin-level cross-agent summary recall from PG.
5. Use `lcm_shared_knowledge_search` for curated workspace knowledge (RLS filtered).
6. Use `lcm_shared_knowledge_write` only from admin agent for curated entries.
7. Use `lcm_manage_roles` for role assignment/revocation and visibility control.

## Enforce shared-knowledge guardrails

- Pass role-group names in `visibleTo` and `editableBy`; do not pass agent IDs.
- Pass `visibility: "restricted"` only with a non-empty `visibleTo`.
- Use `roleGroup` (preferred) or `role` in `lcm_manage_roles` assign/revoke actions.
- Keep each shared knowledge entry focused and evidence-backed.
- Add tags for retrieval (`cost`, `latency`, `compliance`, `decision`, etc.).

## Run the admin workflow in this order

1. Verify admin access:
   - `lcm_manage_roles(action: "list")`
2. Assign any missing role groups:
   - `lcm_manage_roles(action: "assign", agentId: "...", roleGroup: "...")`
3. Read raw agent findings:
   - `lcm_mirror_search(query: "...", limit: 20)`
4. Curate and write knowledge:
   - `lcm_shared_knowledge_write(content: "...", visibility: "...", tags: [...])`
5. Validate audience visibility:
   - `lcm_shared_knowledge_search(query: "...", tags: [...])` from target agents

## Optimize assemble-time shared knowledge injection

- Ask user prompts with specific terms; assemble query uses latest user message text.
- Keep shared entries short and keyword-rich to improve retrieval.
- Tune injection caps if needed:
  - `LCM_ASSEMBLE_SK_LIMIT`
  - `LCM_ASSEMBLE_SK_MAX_TOKENS`
  - `LCM_ASSEMBLE_SK_TIMEOUT_MS`

## Use this troubleshooting map

- Error: `Caller identity could not be resolved`
  - Use parseable agent session keys (`agent:<agentId>:...`).
  - Run under real agent sessions (not anonymous/non-agent session keys).

- Error: `No shared knowledge database URL resolved`
  - Set `LCM_MIRROR_DATABASE_URL` or `mirrorAgentDatabaseUrls.main`.

- Error: `Access denied ... does not have admin role`
  - Ensure caller has admin role in `knowledge_roles`.
  - Seed/assign via `LCM_ROLE_BOOTSTRAP_MAP` and `lcm_manage_roles`.

- `lcm_mirror_search` denied while shared knowledge is disabled
  - Set `LCM_ADMIN_AGENT_IDS` / `mirrorAdminAgents` for bootstrap admin.

- No shared knowledge appears during assemble
  - Verify `LCM_SHARED_KNOWLEDGE_ENABLED=true`.
  - Verify `LCM_ASSEMBLE_SHARED_KNOWLEDGE=true`.
  - Verify caller agent can resolve identity and has read roles for restricted rows.

## Produce this final demo output

- Summarize a final decision memo with:
  - latency findings
  - cost findings
  - compliance findings
  - cross-functional recommendation
- Report scorecard:
  - human relay messages
  - key findings coverage
  - restricted visibility checks (pass/fail)
