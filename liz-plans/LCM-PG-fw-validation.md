# LCM-PG Mirror — Validation Plan

## Current State

- OpenClaw `2026.3.8` is installed via Homebrew at `/opt/homebrew/bin/openclaw`
- The **stock** lossless-claw v0.4.0 is installed (copied, not linked) at `~/.openclaw/extensions/lossless-claw/`
- The **fork** with PG mirror code is at this repo (`/Users/lizbai/Documents/OpenClaw/VibeCoding/lossless-claw/`)
- Unit tests already pass (`vitest run`), including `test/mirror-extract.test.ts`
- **You do NOT need OpenClaw source code.** The global CLI + plugin SDK is sufficient.

---

## Validation Layers

### Layer 1: Unit Tests (already done)

`npx vitest run --dir test` passes all existing tests including `mirror-extract.test.ts`. The extract logic, queue, and config resolution are covered.

### Layer 2: PG Integration Test (new)

[`src/mirror/pg-sink.ts`](../src/mirror/pg-sink.ts) `upsertLcmMirrorRow` talks to real PostgreSQL and is currently untested against a live database.

- **Option A**: Run a local PG via Docker (`docker run --name lcm-pg -e POSTGRES_PASSWORD=lcm -p 5432:5432 -d postgres:16`)
- **Option B**: Use a free cloud PG (Neon, Supabase, etc.) if you already have one

Write a test (`test/mirror-pg-sink.test.ts`) that:

1. Connects to the PG instance
2. Calls `ensureLcmMirrorTable` and verifies `lcm_mirror` table exists
3. Calls `upsertLcmMirrorRow` with a mock payload and `SELECT`s it back
4. Calls upsert again with the same `content_hash` and verifies idempotency (`ON CONFLICT DO NOTHING`)
5. Calls `closeAllMirrorPools` for cleanup

### Layer 3: End-to-End with OpenClaw (the key step)

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

Steps:

1. **Build the plugin**: `npm run build` in the fork directory to ensure TypeScript compiles cleanly
2. **Re-link the plugin**:
   ```bash
   openclaw plugins install --link /Users/lizbai/Documents/OpenClaw/VibeCoding/lossless-claw
   ```
   This replaces the static copy with a symlink to the fork.
3. **Start PostgreSQL** (Docker or local)
4. **Set mirror env vars** before starting OpenClaw:
   ```bash
   export LCM_MIRROR_ENABLED=true
   export LCM_MIRROR_DATABASE_URL=postgresql://postgres:lcm@localhost:5432/postgres
   export LCM_MIRROR_MODE=latest_nodes   # or root_view
   ```
5. **Start OpenClaw** with `openclaw` — check startup logs for the mirror banner (the code in [`src/plugin/index.ts`](../src/plugin/index.ts) logs when mirror is enabled)
6. **Have a conversation** long enough to trigger compaction (8+ turns by default, governed by `freshTailCount` and `contextThreshold`)
7. **Check PG**:
   ```bash
   psql postgresql://postgres:lcm@localhost:5432/postgres \
     -c "SELECT mirror_id, agent_id, mode, length(content), captured_at FROM lcm_mirror;"
   ```
8. **Verify**: rows appear with correct `agent_id`, `mode`, non-empty `content`, and `summary_ids` JSONB

### Layer 4: Regression Check

After linking the fork, run a short conversation with `LCM_MIRROR_ENABLED=false` (or unset) and verify the plugin behaves identically to stock LCM — no PG errors, no extra latency, lcm tools (`lcm_grep`, `lcm_describe`, `lcm_expand`) work normally.

---

## What You Do NOT Need

- **OpenClaw source code** — the plugin interface is stable and the installed CLI is sufficient
- **Pulling the OpenClaw repo** — only needed if you want to modify OpenClaw itself (e.g., to expose `workspaceId`/`userId` to the `ContextEngine` API, which is a future upstream PR)

---

## Related Documents

- [LCM-PG-fw-plan.md](./LCM-PG-fw-plan.md) — mirror implementation plan
- [LCM-PG-fast-workround.md](./LCM-PG-fast-workround.md) — fast workaround overview
- [LCM-PG-PLUG.md](./LCM-PG-PLUG.md) — overall architecture proposal
- [LCM-PG-IMPLEMENTATION-PLAN.md](./LCM-PG-IMPLEMENTATION-PLAN.md) — full implementation plan
- [specs/lcm-pg-decisions.md](../specs/lcm-pg-decisions.md) — ADR decisions
