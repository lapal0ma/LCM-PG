# LCM-PG Mirror — Validation Plan

## Current State

- OpenClaw `2026.3.8` is installed via Homebrew at `/opt/homebrew/bin/openclaw`
- The **fork** (lcm-pg) is linked as the active context engine at `~/Documents/OpenClaw/VibeCoding/LCM-PG/`
- `~/.openclaw/openclaw.json` has `"slots": { "contextEngine": "lcm-pg" }`
- PostgreSQL 16.13 installed locally via Homebrew; `lcm_test` database created
- **You do NOT need OpenClaw source code.** The global CLI + plugin SDK is sufficient.

---

## Validation Layers

### Layer 1: Unit Tests (done)

`npx vitest run --dir test` — 372 tests pass, including `mirror-extract.test.ts`. The extract logic, queue, and config resolution are covered.

### Layer 2: PG Integration Test (done)

PostgreSQL 16 installed locally via Homebrew. `test/mirror-pg-sink.test.ts` tests against real PG:

```bash
TEST_PG_URL=postgresql://$(whoami)@localhost:5432/lcm_test npx vitest run test/mirror-pg-sink.test.ts
```

Covers: table creation, upsert round-trip, idempotency, distinct content hashes. All 4 tests pass.

### Layer 3: End-to-End with OpenClaw (done — 2026-03-21)

```
  User ──message──▸ OpenClaw ──ingest()──▸ LCM-PG Plugin
                                              │
                                     persist ─┤──▸ SQLite
                                              │
                              afterTurn() ────┤
                                              │  compact (summarize)
                                              │  enqueueMirrorAfterTurn
                                              │
                                              └──async──▸ PostgreSQL
                                                          lcm_mirror row
```

**Result**: 1 mirror row confirmed in `lcm_mirror` with correct `agent_id=main`, `mode=latest_nodes`, 943-char summary content, `summary_ids` JSONB, and SHA-256 `content_hash` for idempotency. Full details in [Layer3-validation-log.md](./Layer3-validation-log.md).

**Reproduction recipe**:

```bash
# 1. Link the plugin (ensure openclaw.json has "contextEngine": "lcm-pg")
openclaw plugins install --link /path/to/LCM-PG

# 2. Start gateway with mirror + low threshold for fast compaction
LCM_MIRROR_ENABLED=true \
LCM_MIRROR_DATABASE_URL="postgresql://$(whoami)@localhost:5432/lcm_test" \
LCM_MIRROR_MODE=latest_nodes \
LCM_CONTEXT_THRESHOLD=0.05 \
openclaw gateway --force

# 3. Send messages (compaction triggers quickly at 0.05 threshold)
openclaw agent --session-id test-mirror --message "Tell me a long story." --json

# 4. Check PG
psql -d lcm_test -c "SELECT mirror_id, agent_id, mode, length(content), captured_at FROM lcm_mirror;"
```

**Key gotchas encountered during validation** (see [Layer3-validation-log.md](./Layer3-validation-log.md)):

1. **Slot mismatch**: After renaming plugin ID from `lossless-claw` to `lcm-pg`, `openclaw.json` `slots.contextEngine` must also be updated — OpenClaw doesn't auto-resolve renames.
2. **Provider outage**: If your primary LLM provider is down, switch with `openclaw config set agents.defaults.model "provider/model"` + gateway restart.
3. **Threshold tuning**: The default `contextThreshold=0.75` requires ~96k tokens before compaction. For testing, set `LCM_CONTEXT_THRESHOLD=0.05` to trigger compaction with just a few messages.

### Layer 4: Regression Check (done — 2026-03-21)

Restarted gateway with `LCM_MIRROR_ENABLED=false`:

- No "PG mirror enabled" banner in logs — correct
- Agent conversations succeed normally, no PG/mirror errors
- Plugin loads as `lcm-pg` (ID), `LCM-PG Context Management` (name), v0.4.0
- All LCM tools (`lcm_grep`, `lcm_describe`, `lcm_expand`) available and functional

---

## FW-M4 Validation: Shared Knowledge + Role-Based Access

M4 adds PG read tools, shared knowledge, and role-based access control. The validation is structured in three layers: automated tests, manual PG verification, and end-to-end with OpenClaw.

### Layer 5: M4 Unit Tests

All new tools have unit tests that run without PG (mocked or gated by `describe.skip`):

```bash
npx vitest run --dir test
```

Verify that:
- `lcm_mirror_search` rejects non-admin callers
- `lcm_shared_knowledge_write` rejects non-admin callers and validates `visibility` enum
- `lcm_shared_knowledge_search` formats results correctly
- `lcm_manage_roles` rejects non-admin callers and validates `action` enum

### Layer 6: M4 PG Integration — Schema and CRUD

Requires local PostgreSQL (`TEST_PG_URL`):

```bash
TEST_PG_URL=postgresql://$(whoami)@localhost:5432/lcm_test npx vitest run test/pg-reader.test.ts
```

Verify that:
1. `ensureSharedKnowledgeTables` creates both `shared_knowledge` and `knowledge_roles` tables
2. `agent_matches_any()` SQL function exists and works
3. `assignRole` / `revokeRole` / `listRoles` CRUD works
4. `writeSharedKnowledge` inserts a row and all columns round-trip
5. `updateSharedKnowledge` and `deleteSharedKnowledge` work

### Layer 7: M4 PG Integration — RLS Policy Enforcement

The critical test — verifies that agents only see what they're supposed to:

```bash
TEST_PG_URL=postgresql://$(whoami)@localhost:5432/lcm_test npx vitest run test/pg-rls.test.ts
```

Test matrix:

| Scenario | Expected |
|----------|----------|
| Admin writes entry with `visibility='shared'` | All agents can SELECT it |
| Admin writes entry with `visibility='restricted', visibleTo=['researcher']` | Only agents with role `researcher` (or ID in `visibleTo`) can SELECT it |
| Admin writes entry with `visibility='private'` | Only the owner agent can SELECT it |
| Agent with role `researcher` searches | Sees shared + restricted-to-researcher entries |
| Agent with no roles searches | Sees only shared entries |
| Agent in `editable_by` tries UPDATE | Succeeds |
| Agent NOT in `editable_by` tries UPDATE | Fails / returns 0 rows |
| Admin assigns a new role to an agent | Agent immediately sees previously restricted entries |
| Admin revokes a role from an agent | Agent immediately loses access to restricted entries |

### Layer 8: M4 End-to-End with OpenClaw

Full workflow with a running OpenClaw instance:

1. **Set up**: Link plugin, start PG, set `LCM_MIRROR_ENABLED=true` + `LCM_ADMIN_AGENT_IDS=main`
2. **Have conversations** with multiple agents (main + at least one other) long enough to trigger compaction → `lcm_mirror` rows appear
3. **As main agent**, use `lcm_mirror_search` to browse all agents' summaries:
   ```
   lcm_mirror_search(query="some topic", limit=5)
   ```
4. **As main agent**, assign roles:
   ```
   lcm_manage_roles(action="assign", agentId="research", role="researcher")
   ```
5. **As main agent**, curate knowledge with restricted visibility:
   ```
   lcm_shared_knowledge_write(
     content="Key finding about X...",
     visibility="restricted",
     visibleTo=["researcher"],
     tags=["findings"]
   )
   ```
6. **As research agent**, verify it can find the entry:
   ```
   lcm_shared_knowledge_search(query="finding", tags=["findings"])
   ```
7. **As a different agent without the researcher role**, verify it **cannot** see the restricted entry
8. **Verify assemble injection**: Check that the research agent's context includes shared knowledge in its system prompt (visible in OpenClaw's debug/diagnostic output or logs)
9. **Verify non-admin rejection**: As a non-admin agent, try calling `lcm_mirror_search` or `lcm_manage_roles` and confirm it returns an error

### Layer 9: M4 Regression Check

With `LCM_MIRROR_ENABLED=false` (or `LCM_SHARED_KNOWLEDGE_ENABLED=false`):

- None of the new PG tools should be registered (they don't appear in agent tool lists)
- `assemble` skips PG injection entirely
- All existing LCM tools (`lcm_grep`, `lcm_describe`, `lcm_expand`) work identically to before
- Full test suite passes:
  ```bash
  npx vitest run --dir test
  ```

---

## What You Do NOT Need

- **OpenClaw source code** — the plugin interface is stable and the installed CLI is sufficient
- **Pulling the OpenClaw repo** — only needed if you want to modify OpenClaw itself (e.g., to expose `workspaceId`/`userId` to the `ContextEngine` API, which is a future upstream PR)

---

## Related Documents

- [LCM-PG-fw-plan.md](./LCM-PG-fw-plan.md) — mirror implementation plan (M0–M3)
- [LCM-PG-fast-workround.md](./LCM-PG-fast-workround.md) — fast workaround overview
- [LCM-PG-PLUG.md](./LCM-PG-PLUG.md) — overall architecture proposal
- [LCM-PG-IMPLEMENTATION-PLAN.md](./LCM-PG-IMPLEMENTATION-PLAN.md) — full implementation plan
- [M4/FW-M4-implementation-plan.md](./M4/FW-M4-implementation-plan.md) — M4 implementation plan
- [specs/lcm-pg-decisions.md](../specs/lcm-pg-decisions.md) — ADR decisions
