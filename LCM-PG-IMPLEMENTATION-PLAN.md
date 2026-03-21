# LCM-PG 实施计划

本文档是 [LCM-PG-PLUG.md](./LCM-PG-PLUG.md) 的 **可执行拆解**，按阶段列出交付物、涉及代码区域与验收标准。顺序假设：**保留 SQLite 为默认路径**，**PostgreSQL 为可选后端**（降低现有用户风险）。

---

## OpenClaw ContextEngine 协议约束（源码结论摘要）

以下结论来自对 **`openclaw/openclaw`** 主线的通读（分析时点约 2026-03；上游路径以该仓库为准），用于 **固定 LCM-PG 的集成假设**，避免重复踩坑。

### 接口事实

- **`ContextEngine`**（典型定义于上游 `src/context-engine/types.ts`）各方法参数主要包含：`sessionId`、`sessionKey?`、`sessionFile?`、`messages`、`tokenBudget`、`model?` 等。
- **不存在** 独立的 `workspaceId` / `tenantId` / `orgId` / `userId` / `agentId` 字段。
- `afterTurn` / `compact` 上的 **`runtimeContext`** 类型为 **`Record<string, unknown>`**，未文档化稳定键名；已知用途之一是上层的 `workspaceDir`（见上游 `src/context-engine/delegate.ts` 展开给 embedded compact），**不能**当作多租户身份契约。
- **`registerContextEngine` 的 factory** 通常为 **无参** `() => ContextEngine`，难以在工厂阶段绑定「每次调用的 agent」。
- 对比：**`OpenClawPluginToolContext`**（memory/tool 插件，上游 `src/plugins/types.ts`）包含 `agentId`、`sessionKey`、`workspaceDir`、`agentAccountId`、`requesterSenderId` 等——**比 ContextEngine 丰富得多**。

### `sessionKey` / `sessionId` 语义（路由依据）

- **`sessionKey`**：稳定字符串，形如 `agent:<agentId>:<rest>`（路由/会话策略决定 `rest`）。上游提供 **`parseAgentSessionKey`**（如 `src/sessions/session-key-utils.ts`），可解析出 **`agentId`**。
- **`sessionId`**：进程内 **短暂 UUID**（如 reset 后轮换），**不能**作为跨重启的 PG 主键；持久键仍应以 **`sessionKey`**（+ 库内 `conversation`）为主。

### 与 LCM 产品「workspace」的区分

- OpenClaw **`AgentConfig.workspace`** 是 **本机目录路径**，**不是** toB 的 `workspace_id`。
- LCM-PG 的 **「每 workspace 一个 PG database」** 应通过 **插件配置映射**：`agentId`（或 `sessionKey` 前缀规则）→ **DSN / dbname**，而非假设核心会传 `workspaceId`。

### 对 RLS 的含义

- **不改 OpenClaw 核心** 时：**无法**从 ContextEngine 参数获得可信 **`userId`** → **基于用户的行级 RLS** 在网关内不可填 `app.user_id`（除非自研前置网关注入连接/session，或等待上游扩展协议）。
- **一期可行**：**按 `agent_id`（从 `sessionKey` 解析）** 的 RLS + **每 toB workspace 一库**（库级已隔离其他客户）。

---

## 阶段 0：前置决策与集成策略（3–5 天）

| 决策项 | 选项 | 建议（结合上游现状） |
|--------|------|----------------------|
| 连接配置 | `LCM_DATABASE_URL` vs 拆分 host/db/user | 优先 **URL**；支持 **`LCM_PG_WORKSPACE_MAP`** JSON 或插件 config：**`agentId` → connection string**（多库路由） |
| Workspace ↔ DB | 每 toB workspace 一 `DATABASE` | **供应服务** 建库 + 跑迁移；运行时 **仅通过映射选 DSN**，核心不传 workspaceId |
| **身份来源（已核实）** | 等上游 PR vs 插件侧 workaround | **默认采用 workaround（方案 C）**；并行跟踪上游 **方案 A**（见下节） |
| RLS 执行者 | BYPASSRLS vs 受限 ROLE | **迁移 ROLE** + **`lcm_runtime`**；**一期 RLS 以 `agent_id` 为主** |
| `owner_user_id` 列 | 必填 vs 可空 | **可空** 直至上游传入 `userId` 或网关注入 |

### 方案 C（短期，无上游改动）

1. 在每个 ContextEngine 入口使用 **`sessionKey`** → 调用与上游一致的 **`parseAgentSessionKey`**（若 `openclaw/plugin-sdk` 未稳定导出，则 **复制解析规则**并单测锁定格式）。
2. 用 **`agentId`**（及可选 `sessionKey` 前缀规则）查 **插件 config 映射** → 选择 **PG 连接池/DSN**（对应 toB workspace 库）。
3. `SET LOCAL app.agent_id = '<parsed>'`（或等价）再执行业务 SQL，配合 RLS。
4. **文档声明**：多用户 RLS 需 **上游扩展** 或 **OpenClaw 外的 API 网关** 发起到 **按用户分库/分 schema** 的部署。

### 上游演进路径（与 LCM 并行跟踪，可选贡献 PR）

| 阶段 | 内容 | 对 LCM-PG 的收益 |
|------|------|------------------|
| **U1** | 在 `runtimeContext` **文档化** `agentId`、`workspaceDir`、`userId?` 等键（`afterTurn`/`compact` 先） | 减少魔法字典；仍非全方法覆盖 |
| **U2** | 新增正式类型（如 `ContextEngineCallContext`），**所有** `ingest` / `assemble` / … 透传 | **可信 `agentId` + 可选 `userId`**，RLS 完整 |
| **U3** | 网关层保证 context **不可被通道消息伪造** | toB 安全叙事 |

**产出**：本仓库 `specs/lcm-pg-decisions.md`（或 ADR）+ **「OpenClaw 集成」小节**：列明依赖版本、workaround、上游 issue/PR 链接。

---

## 阶段 1：存储抽象与驱动边界（约 1–2 周）

**目标**：把 `DatabaseSync` 从业务代码中剥离，形成 **方言无关** 的窄接口，SQLite 实现零行为回归。

### 1.1 定义 `LcmDb` 接口

- **能力**：`exec` / `prepare` 风格或 **`query` / `queryOne` / `execute` + 事务 `transaction(fn)`**；需支持 **参数绑定**、**多行结果**、**单插入 `RETURNING`**（PG）与 **lastInsertRowid**（SQLite 兼容层）。
- **事务**：`BEGIN` / `COMMIT` / `ROLLBACK`；SQLite 保留 `BEGIN IMMEDIATE` 语义在 SQLite 实现内。

### 1.2 实现

- **`SqliteLcmDb`**：包装现有 `node:sqlite` `DatabaseSync`（[`src/db/connection.ts`](src/db/connection.ts)）。
- **`PostgresLcmDb`**：使用 `pg` 或 `postgres`（推荐 **`postgres`** 或 **`pg` + 连接池**），**异步** API；[`ConversationStore`](src/store/conversation-store.ts) / [`SummaryStore`](src/store/summary-store.ts) 已多为 `async`，内部改为 `await db.*`。

### 1.3 工厂与配置

- 扩展 [`src/db/config.ts`](src/db/config.ts)：解析 `LCM_DATABASE_URL` / `LCM_DATABASE_KIND=sqlite|postgres`。
- [`src/plugin/index.ts`](src/plugin/index.ts)（或引擎入口）：根据配置构造 `LcmContextEngine(..., db)`。

**验收**：现有 Vitest 在 **仅 SQLite** 下 **全绿**；新增少量 **接口契约测试**（mock db）。

**风险**：`engine.ts` 体量大，需 **最小改动** 传递接口类型而非 `DatabaseSync`。

---

## 阶段 2：PostgreSQL DDL 与迁移管线（约 1–2 周）

**目标**：与 SQLite **同构** 的业务表 + PG 专用类型与索引；**版本化迁移**（非仅 `IF NOT EXISTS` 堆砌）。

### 2.1 Schema（每个 workspace 库内）

- **自 LCM 现有表** 映射：[`src/db/migration.ts`](src/db/migration.ts) 中 `conversations`, `messages`, `message_parts`, `summaries`, `summary_*`, `context_items`, `large_files`, `conversation_bootstrap_state` 等。
- **PG 调整**：
  - `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL` / `GENERATED ALWAYS AS IDENTITY`（按表选择）。
  - `TEXT` 时间 → `TIMESTAMPTZ`（推荐）或保持 `TEXT` 以降低改动面（一期可 TEXT，二期再收紧）。
  - 外键、`ON DELETE` 行为与 SQLite 对齐。
- **新增列（多用户）**：`conversations`（及必要子表）增加 **`agent_id`（TEXT，与解析自 `sessionKey` 的 id 一致）**、**`owner_user_id`（可空 TEXT，待上游传 user 或网关注入）**；**共享表** `shared_knowledge`（见阶段 4）。写入时 **`agent_id` 以当前调用的 `parseAgentSessionKey(sessionKey).agentId` 为准**（子会话 key 仍含父 agent 前缀时需与产品规则一致）。

### 2.2 迁移工具

- 选用其一：**手写编号 SQL 文件**、`node-pg-migrate`、`Drizzle`、`Flyway`（若团队已标准化）。
- **规则**：迁移在 **每个 workspace DB** 上执行；**元表** `lcm_schema_migrations(version, applied_at)`。

**验收**：空 PG 上 **一键迁移** 得到完整 schema；与 SQLite 迁移后 **同一条 golden path**（创建会话 → 写消息 → 读回）。

---

## 阶段 3：全文检索（PG）（约 1 周，可与阶段 2 并行后半）

**目标**：`full_text` 模式在 PG 上与 FTS5 **行为可接受一致**（排序/片段可略差异）。

- **`messages.content` / `summaries.content`**：`tsvector` 列 + **GIN**；`UPDATE` 触发器或应用层同步（与当前 FTS5 维护方式对齐）。
- 替换 [`conversation-store.ts`](src/store/conversation-store.ts) / [`summary-store.ts`](src/store/summary-store.ts) 中 `MATCH` / `snippet` / `rank` / `julianday` 为 PG 等价（`@@`、`ts_headline`、`ts_rank`、`created_at` 比较）。
- [`src/store/fts5-sanitize.ts`](src/store/fts5-sanitize.ts)：增加 **PG 查询构建** 或共用保守 token 策略。

**验收**：[`test/fts-fallback.test.ts`](test/fts-fallback.test.ts) 类用例在 PG fixture 下通过或 **双轨跳过** 明确标注。

---

## 阶段 4：共享知识表与 `assemble` 注入（约 1 周）

**目标**：同 workspace 库内 **共享知识** + **token 封顶** 合并进上下文。

- **表**（示例）：`shared_knowledge(id, title, content, tags, created_by_agent_id, visibility, updated_at, …)`；二期 `embedding vector`。
- **检索**：一期 **关键词 / `tsvector`**；`limit` + `ORDER BY`。
- **引擎**：[`src/assembler.ts`](src/assembler.ts) 或 [`src/engine.ts`](src/engine.ts) 的 `assemble` 路径末尾：若配置启用，调用 **KnowledgeService**（同进程内 SQL 即可）拉 top-K，格式化为 **system 附加**（与现有 `systemPromptAddition` 模式对齐）。
- **配置**：`sharedKnowledgeMaxTokens`、`sharedKnowledgeLimit`（`openclaw.plugin.json` + env）。

**验收**：集成测试：**有/无共享行** 时 `assemble` 输出长度与内容符合预期；**超时/无数据** 不抛致命错误。

---

## 阶段 5：RLS 与 ROLE（约 1–2 周）

**目标**：即使应用漏写 `WHERE`，**同库内** 按 **`agent_id`（一期）** 隔离会话；共享表按角色可读/写。**用户级行隔离** 列为 **二期**（依赖上游 `userId` 或自建网关）。

### 5.1 一期（与方案 C 一致）

- 为 `conversations` / `messages` 等启用 **RLS**。
- 每个请求（或从池取连接后）：`set_config('app.agent_id', <parsed_agent_id>, false)`（与写入列 `agent_id` 一致）。
- 策略示例：`conversations.agent_id = current_setting('app.agent_id', true)`；共享表允许 `SELECT` 全 workspace 成员，`INSERT/UPDATE` 按 `created_by_agent_id` 或 ROLE 限制。
- **迁移角色**：`lcm_migrator`（DDL）；**运行时** `lcm_runtime`（无 BYPASSRLS）。

### 5.2 二期（可选）

- 当 OpenClaw 传入可信 **`userId`**（或网关注入）：增加 `set_config('app.user_id', …)`，策略中 **AND** `owner_user_id = current_setting('app.user_id')`（可空行仅服务进程/系统任务）。

**验收**：**负向测试**：错误 `app.agent_id` 下查询为空或失败；文档说明 **OpenClaw 进程 PG 凭证** 与 **映射 config**；若未实现 user RLS，文档 **显式列出限制**。

---

## 阶段 6：Workspace 供应与运维（与研发并行，约 1–2 周）

**目标**：**每 toB workspace 一库** 可重复创建；**多个 OpenClaw 实例/多个 agent** 通过 **映射** 连到正确库。

- **脚本或服务**：`CREATE DATABASE lcm_ws_<slug>` → 跑迁移 → 创建 `lcm_runtime` → 授予 `CONNECT`。
- **连接串下发**：控制面存 **加密**连接串；**每台网关** 的配置可为 **多 DSN**：插件内 **`agentId → url`** 表（或前缀规则），因核心 **不会** 下发 `workspaceId`。
- **监控**：连接数、慢查询、`pg_database_size`、按库备份；**按 agent 池** 监控（若每 agent 独立连接池）。

**验收**：Runbook：**两个 toB workspace、两个库、两个 agentId 映射**；文档说明与 OpenClaw **`AgentConfig.workspace`（目录）** 无混淆。

---

## 阶段 7：双后端 CI 与迁移工具（约 1 周）

- **CI**：`postgres:16` service container；跑 **PG 专用**测试子集 + SQLite 全量。
- **可选**：SQLite → PG **导出导入工具**（按 `conversation_id` 批量拷贝）；面向现有 `~/.openclaw/lcm.db` 用户。

---

## 阶段 8（可选）：TUI 与大型文件

- **[`tui/`](tui/)**：今日为 SQLite（Go `modernc.org/sqlite`）。若需连 PG：**`database/sql` + `pgx`/`lib/pq`**，SQL 方言与 TS 侧对齐，或 **仅只读仪表连 PG**。
- **大文件**：[`docs/architecture.md`](docs/architecture.md) 中本地路径；多机时改为 **S3 兼容存储**，表内只存 URI（与 PG 方案一致）。

---

## 里程碑汇总（粗粒度）

| 里程碑 | 内容 | 大致顺序 |
|--------|------|----------|
| M0 | **OpenClaw 集成定稿**：方案 C 映射 + ADR；可选登记上游 issue | 0 |
| M1 | 存储抽象 + SQLite 回归 | 1 |
| M2 | PG DDL + 迁移 + 引擎读写通（含 **sessionKey→agentId→选库**） | 2 |
| M3 | PG 全文检索 + grep 路径 | 3 |
| M4 | 共享知识 + assemble | 4 |
| M5 | RLS（**agent 一期**）+ 运行时 ROLE | 5 |
| M6 | Workspace 供应 Runbook + CI PG | 6–7 |
| M7（可选） | **user 级 RLS**（依赖上游 U2 或网关） | 上游就绪后 |

---

## 依赖与风险

| 风险 | 缓解 |
|------|------|
| **ContextEngine 无独立 `agentId`/`userId`/`workspaceId`**（已核实） | **方案 C**：`parseAgentSessionKey(sessionKey)` + **插件 config `agentId → DSN`**；并行推动上游 **U1–U2** |
| **`sessionKey` 格式未来变更** | 单元测试锁定解析；关注 OpenClaw changelog；优先用 SDK 导出函数（若稳定） |
| **无法做可信 user 级 RLS（一期）** | 文档写明；toB 强需求时用 **网关分租户** 或等 **U2** |
| **`runtimeContext` 无稳定契约** | 不依赖其承载身份；仅可作 **可选** `workspaceDir` 交叉校验 |
| 每库迁移成本 N 个 workspace | 迁移 **幂等**、自动化；大客 **限量库数** 或改 **单库+RLS** |
| 异步驱动渗透 | 集中 `PostgresLcmDb`，避免散落 `pool.query` |
| TUI 分裂 | 二期或声明 **仅 TS 插件支持 PG** |

---

## 建议执行顺序（单人全职量级）

1. **M0 / 阶段 0**：集成策略 + ADR +（可选）`agentId→DSN` 配置 schema 草案。  
2. 阶段 1 → 2（含 **多 DSN 或连接路由器** 雏形）→ 3 → 4 → 7（CI）→ 5 → 6；TUI/大文件为 **8** 按需插入。

**粗估**：**M0+M1–M4** 约 **4–9 周**（含映射与多库连接管理）；**M5–M6** 约 **2–4 周**。**M7** 取决于 OpenClaw 上游，不单列工期。

---

*实施计划随里程碑关闭持续更新；变更请同步 [LCM-PG-PLUG.md](./LCM-PG-PLUG.md) 中开放决策章节。*
