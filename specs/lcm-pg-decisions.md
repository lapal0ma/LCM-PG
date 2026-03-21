# LCM-PG 架构决策记录（草案）

> 与 [LCM-PG-PLUG.md](../LCM-PG-PLUG.md)、[LCM-PG-IMPLEMENTATION-PLAN.md](../LCM-PG-IMPLEMENTATION-PLAN.md) 同步更新。

## ADR-001：OpenClaw 无 ContextEngine 身份字段时的路由策略

- **状态**：已采纳（workaround）
- **决策**：在 **不修改 OpenClaw 核心** 的前提下，使用 **`parseAgentSessionKey(sessionKey).agentId`** + **插件配置映射**（`agentId` → PostgreSQL DSN / dbname）选择 **toB workspace 对应数据库**；连接上 PG 后 **`set_config('app.agent_id', …)`** 配合 RLS。
- **后果**：`sessionKey` 字符串格式与上游耦合；**无可信 `userId`** 时 **不做用户级 RLS**（二期见实施计划 M7）。
- **上游跟踪**：可选向 `openclaw/openclaw` 提议为 `ContextEngine` 各方法增加统一 `context`（`agentId`、`userId?`、…）。在此记录 issue/PR 链接：`_（待填）_`

## ADR-002：OpenClaw `workspace` 配置语义

- **状态**：已记录
- **决策**：OpenClaw **`agents.list[].workspace`** 表示 **本机工作目录**，**不**作为 LCM-PG 的 **`workspace_id`**。
- **后果**：toB workspace 仅出现在 **LCM 插件配置 / 环境变量 / 控制面下发的 DSN 映射** 中。

---

*更多决策在实现过程中追加（迁移工具、跨 org 知识库等）。*
