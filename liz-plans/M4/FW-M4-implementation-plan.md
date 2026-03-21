# FW-M4: PG Read Path — Mirror Search, Shared Knowledge, and Assemble Integration

# FW-M4：PG 读路径 — 镜像检索、共享知识、Assemble 注入

---

## 1. Goals / 目标

Deliver three new agent tools and an optional `assemble` enhancement that complete the PG read path:

为 LCM-PG 补齐 PG **读** 路径，交付三个新工具 + 一个可选的 `assemble` 增强：

| Tool | Description / 说明 | Access / 访问权限 |
|------|------------|--------|
| `lcm_mirror_search` | Search `lcm_mirror` — query across all agents' compacted summaries by keyword, agent_id, time range / 搜索所有 agent 的压缩摘要 | Admin agent only / 仅管理员 agent |
| `lcm_shared_knowledge_write` | Curate and write entries into `shared_knowledge` with visibility, read/write access controls / 将精选内容写入共享知识表，带可见性、读写权限控制 | Admin agent only / 仅管理员 agent |
| `lcm_shared_knowledge_search` | Search `shared_knowledge`, filtered by RLS — agents only see rows matching their ID or role / 检索共享知识，RLS 按 agent ID 或角色过滤 | All agents / 所有 agent |
| `lcm_manage_roles` | Assign/revoke roles for agents in `knowledge_roles` / 管理 agent 的角色分配 | Admin agent only / 仅管理员 agent |
| `assemble` PG injection (optional) | Auto-inject top shared knowledge hits into every agent's context window / 自动将共享知识 top-K 结果注入每轮上下文 | Transparent / 透明 |

### Non-goals / 非目标

- Full PG backend replacing SQLite (that's the main LCM-PG-IMPLEMENTATION-PLAN)
- Semantic/vector search (pgvector is a future enhancement, not M4)
- User-level RLS (blocked on upstream OpenClaw exposing `userId`)

---

## 2. `shared_knowledge` Table Schema / 共享知识表结构

### 2.1 `knowledge_roles` — Role mapping / 角色映射表

Agents are assigned roles. `visible_to` and `editable_by` in `shared_knowledge` accept both agent IDs and role names, resolved at query time via this table.

每个 agent 可分配一个或多个角色。`shared_knowledge` 的 `visible_to`/`editable_by` 同时支持 agent ID 和角色名，查询时通过此表动态解析。

```sql
CREATE TABLE IF NOT EXISTS knowledge_roles (
  agent_id    TEXT NOT NULL,
  role        TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, role)
);

CREATE INDEX IF NOT EXISTS kr_role_idx ON knowledge_roles (role);
```

Example data / 示例数据：

| agent_id | role |
|----------|------|
| `main` | `admin` |
| `research` | `researcher` |
| `coder` | `developer` |
| `coder` | `researcher` |
| `intern` | `viewer` |

Benefits over hardcoding agent IDs in every row / 相比在每行中硬编码 agent ID 的优势：

| Scenario / 场景 | How it's handled / 处理方式 |
|---|---|
| New agent added / 新增 agent | Insert one row into `knowledge_roles`. Agent instantly sees all knowledge visible to those roles. / 插入一行即可，立即可见所有对应角色的知识 |
| Agent goes idle / agent 闲置 | Delete from `knowledge_roles` or leave as-is — no harm. / 删除或保留均可，无副作用 |
| Permission change / 权限变更 | Update the agent's role (one row). All knowledge with that role in `visible_to` is instantly affected. / 修改一行角色映射，所有相关知识权限立即生效 |
| Per-entry override / 单条特例 | Put a specific agent_id directly in `visible_to` — works alongside roles. / 直接在 `visible_to` 中写入特定 agent_id，与角色并存 |

### 2.2 `shared_knowledge` — Knowledge table / 知识表

```sql
CREATE TABLE IF NOT EXISTS shared_knowledge (
  knowledge_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL,
  visibility     TEXT NOT NULL DEFAULT 'shared',
  visible_to     TEXT[] NOT NULL DEFAULT '{}',
  editable_by    TEXT[] NOT NULL DEFAULT '{}',
  title          TEXT,
  content        TEXT NOT NULL,
  source_mirror_ids UUID[],
  tags           TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sk_visibility_idx ON shared_knowledge (visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS sk_owner_idx ON shared_knowledge (owner_agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS sk_tags_idx ON shared_knowledge USING GIN (tags);
CREATE INDEX IF NOT EXISTS sk_visible_to_idx ON shared_knowledge USING GIN (visible_to);
```

Column notes / 字段说明：

| Column | Purpose / 用途 |
|--------|---------|
| `owner_agent_id` | The agent that created this entry (typically admin/main) / 创建者 agent（通常为 admin/main） |
| `visibility` | `'shared'` (all agents can read), `'private'` (owner only), `'restricted'` (only `visible_to` list) / 可见性级别 |
| `visible_to` | Array of agent IDs **or role names** that can READ this row (used when `restricted`) / 可读取此行的 agent ID 或角色名列表（`restricted` 时生效） |
| `editable_by` | Array of agent IDs **or role names** that can UPDATE/DELETE this row / 可修改此行的 agent ID 或角色名列表 |
| `title` | Optional human-readable title for the knowledge entry / 可选标题 |
| `content` | The curated knowledge text / 知识正文 |
| `source_mirror_ids` | References to `lcm_mirror.mirror_id` rows this was derived from (traceability) / 溯源：来自哪些 mirror 行 |
| `tags` | Freeform tags for filtering (e.g. `['onboarding', 'api-design']`) / 自由标签，用于过滤 |

Visibility semantics / 可见性语义：

| `visibility` | Who can READ / 谁可读 | Who can WRITE / 谁可写 |
|---|---|---|
| `shared` | All agents / 所有 agent | Owner + agents/roles in `editable_by` |
| `restricted` | Owner + agents/roles in `visible_to` | Owner + agents/roles in `editable_by` |
| `private` | Owner only / 仅所有者 | Owner only / 仅所有者 |

---

## 3. RLS Policies / 行级安全策略

RLS resolves `visible_to`/`editable_by` by checking both the agent's direct ID and any roles the agent holds in `knowledge_roles`. A helper function encapsulates the matching logic:

RLS 同时检查 agent 的直接 ID 和其在 `knowledge_roles` 中的角色。辅助函数封装匹配逻辑：

```sql
-- Helper: does the current agent match any entry in a TEXT[] (by ID or role)?
-- 辅助函数：当前 agent 是否匹配 TEXT[] 中的任意条目（按 ID 或角色）？
CREATE OR REPLACE FUNCTION agent_matches_any(arr TEXT[]) RETURNS BOOLEAN AS $$
  SELECT
    current_setting('app.agent_id', true) = ANY(arr)
    OR EXISTS (
      SELECT 1 FROM knowledge_roles
      WHERE agent_id = current_setting('app.agent_id', true)
        AND role = ANY(arr)
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE shared_knowledge ENABLE ROW LEVEL SECURITY;

-- Admin bypass: admin agent sees and modifies everything
-- 管理员绕过：admin agent 可见且可修改所有行
CREATE POLICY sk_admin_bypass ON shared_knowledge FOR ALL
  USING (current_setting('app.is_admin', true) = 'true');

-- All agents can read shared rows
-- 所有 agent 可读 visibility='shared' 的行
CREATE POLICY sk_read_shared ON shared_knowledge FOR SELECT
  USING (visibility = 'shared');

-- Owner can read/write all own rows
-- 所有者可读写自己的行
CREATE POLICY sk_owner_all ON shared_knowledge FOR ALL
  USING (owner_agent_id = current_setting('app.agent_id', true))
  WITH CHECK (owner_agent_id = current_setting('app.agent_id', true));

-- Agents matching visible_to (by ID or role) can read restricted rows
-- 匹配 visible_to 的 agent（按 ID 或角色）可读 restricted 行
CREATE POLICY sk_read_restricted ON shared_knowledge FOR SELECT
  USING (visibility = 'restricted' AND agent_matches_any(visible_to));

-- Agents matching editable_by (by ID or role) can update shared/restricted rows
-- 匹配 editable_by 的 agent（按 ID 或角色）可修改 shared/restricted 行
CREATE POLICY sk_update_authorized ON shared_knowledge FOR UPDATE
  USING (agent_matches_any(editable_by))
  WITH CHECK (agent_matches_any(editable_by));

-- Agents matching editable_by can delete shared/restricted rows
-- 匹配 editable_by 的 agent 可删除 shared/restricted 行
CREATE POLICY sk_delete_authorized ON shared_knowledge FOR DELETE
  USING (agent_matches_any(editable_by));
```

The connection must call `SET app.agent_id = '...'` (and optionally `SET app.is_admin = 'true'` for admin) before any query. This is handled in the PG read layer via `setAgentSession()`.

连接建立后需 `SET app.agent_id` 和可选 `SET app.is_admin`，由 PG 读取层的 `setAgentSession()` 统一处理。

---

## 4. New Code Modules / 新增代码模块

### 4.1 `src/mirror/pg-reader.ts`

Shared PG read layer, reusing the pool infrastructure from `pg-sink.ts`.

复用 `pg-sink.ts` 的连接池，提供 PG 读取能力。

```
Functions:
  -- Schema setup (idempotent)
  ensureSharedKnowledgeTables(connStr)    -- DDL for shared_knowledge + knowledge_roles + RLS + helper fn
  setAgentSession(pool, agentId, isAdmin) -- SET app.agent_id, app.is_admin

  -- lcm_mirror reads
  searchMirror(connStr, opts)             -- SELECT from lcm_mirror with filters

  -- shared_knowledge CRUD
  searchSharedKnowledge(connStr, opts)    -- SELECT from shared_knowledge (RLS-filtered)
  writeSharedKnowledge(connStr, entry)    -- INSERT into shared_knowledge
  updateSharedKnowledge(connStr, id, fields) -- UPDATE shared_knowledge
  deleteSharedKnowledge(connStr, id)      -- DELETE from shared_knowledge

  -- knowledge_roles management
  listRoles(connStr)                      -- SELECT all role assignments
  listAgentRoles(connStr, agentId)        -- SELECT roles for a specific agent
  assignRole(connStr, agentId, role)      -- INSERT into knowledge_roles (idempotent)
  revokeRole(connStr, agentId, role)      -- DELETE from knowledge_roles
```

### 4.2 `src/tools/lcm-mirror-search-tool.ts`

Admin-only tool. Queries `lcm_mirror` across all agents.

仅管理员可用。跨 agent 搜索 `lcm_mirror`。

```
Parameters:
  query: string        -- keyword/pattern to search in content
  agentId?: string     -- filter by specific agent
  since?: string       -- ISO timestamp lower bound
  before?: string      -- ISO timestamp upper bound
  limit?: number       -- max results (default 20)

Returns:
  Formatted markdown with matching mirror rows:
  agent_id, conversation_id, mode, content snippet, captured_at
```

### 4.3 `src/tools/lcm-shared-knowledge-write-tool.ts`

Admin-only tool. Curates content into `shared_knowledge`.

仅管理员可用。将精选内容写入 `shared_knowledge`。

```
Parameters:
  content: string               -- the knowledge text (required)
  title?: string                -- human-readable title
  visibility?: string           -- 'shared' (default) | 'private' | 'restricted'
  visibleTo?: string[]          -- agent IDs or role names that can READ (for 'restricted')
  editableBy?: string[]         -- agent IDs or role names that can WRITE
  tags?: string[]               -- freeform tags
  sourceMirrorIds?: string[]    -- traceability back to lcm_mirror rows

Returns:
  Confirmation with knowledge_id
```

Example calls / 示例调用：

```
# Shared with everyone (default)
lcm_shared_knowledge_write(content="API rate limit is 100 req/min", tags=["api"])

# Restricted to researcher role + coder agent specifically
lcm_shared_knowledge_write(
  content="Experimental finding: ...",
  visibility="restricted",
  visibleTo=["researcher", "coder"],
  editableBy=["main"]
)
```

### 4.4 `src/tools/lcm-shared-knowledge-search-tool.ts`

Available to all agents. Searches `shared_knowledge` with RLS filtering.

所有 agent 可用。按 RLS 策略过滤搜索共享知识。

```
Parameters:
  query: string        -- keyword to search in title + content
  tags?: string[]      -- filter by tags (AND logic)
  limit?: number       -- max results (default 10)

Returns:
  Formatted markdown with matching entries:
  title, content snippet, tags, owner, visibility, updated_at
```

### 4.5 `src/tools/lcm-manage-roles-tool.ts`

Admin-only tool. Manages agent-to-role assignments in `knowledge_roles`.

仅管理员可用。管理 agent 与角色的映射关系。

```
Parameters:
  action: string         -- 'list' | 'assign' | 'revoke'
  agentId?: string       -- target agent (required for assign/revoke)
  role?: string          -- role name (required for assign/revoke)

Returns:
  For 'list': table of all agent → role mappings
  For 'assign'/'revoke': confirmation message
```

Example calls / 示例调用：

```
# List all role assignments
lcm_manage_roles(action="list")

# Assign 'researcher' role to new agent 'intern'
lcm_manage_roles(action="assign", agentId="intern", role="researcher")

# Revoke 'developer' role from agent 'coder'
lcm_manage_roles(action="revoke", agentId="coder", role="developer")
```

This gives the admin a single tool to manage permissions dynamically. When a new agent joins, one `assign` call grants it access to all knowledge entries visible to that role — no need to update individual knowledge rows.

管理员通过此工具动态管理权限。新 agent 加入时，一次 `assign` 即可授权其访问所有对应角色可见的知识条目，无需逐行修改。

### 4.6 `src/plugin/index.ts` — tool registration

Register the three new tools following the existing pattern.

在 `register()` 中注册三个新工具，沿用现有模式。

```typescript
// Only register PG tools when mirror is enabled
if (deps.mirrorConfig.enabled) {
  api.registerTool((ctx) => createLcmMirrorSearchTool({ deps, sessionKey: ctx.sessionKey }));
  api.registerTool((ctx) => createLcmSharedKnowledgeWriteTool({ deps, sessionKey: ctx.sessionKey }));
  api.registerTool((ctx) => createLcmSharedKnowledgeSearchTool({ deps, sessionKey: ctx.sessionKey }));
  api.registerTool((ctx) => createLcmManageRolesTool({ deps, sessionKey: ctx.sessionKey }));
}
```

Admin-only gating: `lcm_mirror_search`, `lcm_shared_knowledge_write`, and `lcm_manage_roles` check `agentId` against a config list (e.g. `LCM_ADMIN_AGENT_IDS=main` or `mirrorAdminAgents: ["main"]`). Non-admin agents calling these tools get an error response.

管理员限制：`lcm_mirror_search`、`lcm_shared_knowledge_write` 和 `lcm_manage_roles` 通过配置列表（如 `LCM_ADMIN_AGENT_IDS`）校验调用者身份，非管理员调用返回错误。

### 4.7 `src/assembler.ts` — shared knowledge injection (optional)

Optional enhancement: during `assemble`, if PG is configured, query `shared_knowledge` for the top-K most relevant entries and inject them as a system prompt section.

可选增强：`assemble` 阶段若配置了 PG，查询 `shared_knowledge` top-K 并注入 system prompt。

```
In ContextAssembler.assemble():
  1. Run existing SQLite assembly (unchanged)
  2. If mirrorConfig.enabled && remaining token budget > threshold:
     a. searchSharedKnowledge(url, { query: latest_user_message, limit: 5 })
     b. Format results as: "## Workspace Shared Knowledge\n..."
     c. Append to systemPromptAddition
     d. Deduct estimated tokens from budget
  3. Return combined result
```

Resilience: PG timeout or failure skips the shared knowledge block silently with a log warning. Never blocks the main `assemble` path.

韧性：PG 超时或失败时静默跳过，仅记录警告日志，不阻塞主 `assemble` 流程。

---

## 5. Configuration / 配置

New env vars / plugin config entries:

| Variable | Default | Description / 说明 |
|----------|---------|------------|
| `LCM_ADMIN_AGENT_IDS` | `main` | Comma-separated agent IDs with admin privileges / 逗号分隔的管理员 agent ID |
| `LCM_SHARED_KNOWLEDGE_ENABLED` | `true` (when mirror enabled) | Enable shared knowledge tools and assemble injection / 启用共享知识工具与 assemble 注入 |
| `LCM_ASSEMBLE_SHARED_KNOWLEDGE` | `true` | Auto-inject shared knowledge in assemble / 在 assemble 中自动注入共享知识 |
| `LCM_ASSEMBLE_SK_MAX_TOKENS` | `2000` | Token budget for shared knowledge in assemble / assemble 中共享知识的 token 上限 |
| `LCM_ASSEMBLE_SK_LIMIT` | `5` | Max shared knowledge entries in assemble / assemble 中最多注入的条目数 |

---

## 6. Testing Strategy / 测试策略

### Unit tests (no PG required / 无需 PG)

| Test file | What it covers / 覆盖内容 |
|-----------|------------|
| `test/lcm-mirror-search-tool.test.ts` | Parameter validation, admin gating, result formatting |
| `test/lcm-shared-knowledge-write-tool.test.ts` | Parameter validation, admin gating, visibility/visibleTo defaults |
| `test/lcm-shared-knowledge-search-tool.test.ts` | Parameter validation, result formatting |
| `test/lcm-manage-roles-tool.test.ts` | Parameter validation, admin gating, list/assign/revoke actions |

### PG integration tests (require `TEST_PG_URL` / 需要 `TEST_PG_URL`)

| Test file | What it covers / 覆盖内容 |
|-----------|------------|
| `test/pg-reader.test.ts` | `shared_knowledge` + `knowledge_roles` DDL, CRUD operations, `agent_matches_any` function |
| `test/pg-rls.test.ts` | RLS policy enforcement: shared vs restricted vs private visibility, role-based resolution |
| `test/shared-knowledge-e2e.test.ts` | Full flow: assign role → write as admin with `visibleTo=["researcher"]` → search as agent with role → search as agent without role → verify filtering |

### Regression

Existing tests continue to pass with `LCM_SHARED_KNOWLEDGE_ENABLED=false` (default when mirror is off).

现有测试在 `LCM_SHARED_KNOWLEDGE_ENABLED=false` 时不受影响。

---

## 7. Implementation Phases / 实施阶段

| Phase | Deliverable / 交付物 | Effort / 工期 |
|-------|------------|--------|
| **M4.1** | `shared_knowledge` + `knowledge_roles` DDL + `agent_matches_any` fn + RLS policies in `pg-reader.ts` + integration test | 1–2 days |
| **M4.2** | `pg-reader.ts`: `setAgentSession`, `searchMirror`, role CRUD (`assignRole`, `revokeRole`, `listRoles`) | 1–2 days |
| **M4.3** | `lcm_mirror_search` tool + `lcm_manage_roles` tool + unit tests + admin gating | 1–2 days |
| **M4.4** | `pg-reader.ts`: `writeSharedKnowledge`, `searchSharedKnowledge` CRUD with role-aware queries | 1–2 days |
| **M4.5** | `lcm_shared_knowledge_write` tool + `lcm_shared_knowledge_search` tool + unit tests | 1–2 days |
| **M4.6** | RLS integration test: role-based visibility filtering end-to-end | 1 day |
| **M4.7** | `assemble` shared knowledge injection + config + test | 1–2 days |
| **M4.8** | End-to-end test: assign role → admin writes with visibleTo → agents read (role-filtered) → assemble injects | 1 day |

**Total estimate: ~8–14 days** (熟练者一人约 2–3 周)

---

## 8. Data Flow Summary / 数据流总览

```
  Admin agent manages roles ──▸ knowledge_roles (PG)
  lcm_manage_roles                 │
                                   │  role lookup at query time
                                   │
  Agent X afterTurn ──▸ lcm_mirror (auto, per-compaction)
                            │
  Admin agent uses ─────────┤
  lcm_mirror_search         │ reads all agents' summaries
                            │
  Admin agent curates ──────┤
  lcm_shared_knowledge_write│ writes to shared_knowledge
                            │ (with visibleTo=["researcher", "coder"])
                            ▼
                   shared_knowledge (PG)
                     │          │
      ┌──────────────┘          └──────────────┐
      │                                        │
  lcm_shared_knowledge_search           assemble() injection
  (tool, RLS-filtered by                (auto, top-K into context,
   agent ID + role via                   same RLS filtering)
   knowledge_roles)                            │
      │                                Agent Z gets it transparently
  Agent Y reads explicitly
  (sees rows matching its roles)
```

---

## 9. Dependencies and Risks / 依赖与风险

| Risk / 风险 | Mitigation / 缓解 |
|------|------|
| RLS requires `SET` before every query | Wrap all PG reads in `setAgentSession()` — single entry point, hard to miss / 所有 PG 读操作统一经过 `setAgentSession()`，不易遗漏 |
| `agent_matches_any` subquery on every RLS check | `knowledge_roles` is small (agents × roles); PK index makes lookup fast. Monitor with `EXPLAIN ANALYZE` / `knowledge_roles` 数据量小，PK 索引保证查询快速，可用 `EXPLAIN ANALYZE` 监控 |
| Admin gating relies on `sessionKey` parsing | Same `parseAgentSessionKey` used by mirror (proven path) / 复用镜像已验证的 `parseAgentSessionKey` |
| Role name typos (e.g. "resercher" vs "researcher") | `lcm_manage_roles` lists known roles; future: enum validation or known-role registry / 通过 `lcm_manage_roles` list 检查已有角色；未来可加枚举校验 |
| `assemble` PG latency | Hard timeout (e.g. 500ms) + skip on failure / 硬超时 + 失败跳过 |
| `shared_knowledge` grows unbounded | Future: TTL/archival policy, pagination in search tool / 未来增加 TTL/归档策略与分页 |
| No vector search (keyword only in M4) | Sufficient for MVP; pgvector can be added in M5+ without schema changes (add `embedding` column) / MVP 阶段够用；pgvector 可后续加列，无需改表结构 |
| Agent removed but still in `visible_to` arrays | No harm — orphaned IDs in arrays match nothing. Clean up lazily or via admin tool / 无害——数组中的孤立 ID 不匹配任何人，可懒清理或通过管理工具清除 |

---

## 10. Related Documents / 相关文档

- [LCM-PG-fw-plan.md](../LCM-PG-fw-plan.md) — Mirror implementation plan (M0–M3)
- [LCM-PG-fast-workround.md](../LCM-PG-fast-workround.md) — Fast workaround overview
- [LCM-PG-PLUG.md](../LCM-PG-PLUG.md) — Overall architecture proposal
- [LCM-PG-IMPLEMENTATION-PLAN.md](../LCM-PG-IMPLEMENTATION-PLAN.md) — Full implementation plan
- [LCM-PG-fw-validation.md](../LCM-PG-fw-validation.md) — Validation plan
- [specs/lcm-pg-decisions.md](../../specs/lcm-pg-decisions.md) — ADR decisions
