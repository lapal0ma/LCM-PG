# toB Dashboard v1 Implementation Guide
# toB 看板 v1 实施指南

This guide implements the decisions in:
`docs/tob-dashboard-demo-flow-plan.md` §8

本指南对应：
`docs/tob-dashboard-demo-flow-plan.md` 第 8 节的 v1 决策。

---

## 1) Scope (v1) / 范围（v1）

### EN

- SQL-view-only analytics (no API layer)
- Single workspace
- Topic analytics from `shared_knowledge.tags` only
- Full synthetic playback as primary data strategy

### 中文

- 仅使用 SQL 视图分析（不加 API 层）
- 单 workspace
- 主题分析仅基于 `shared_knowledge.tags`
- 以全量模拟回放作为主数据策略

---

## 2) Artifacts / 产物

- Seeder SQL:
  `sql/tob-dashboard/v1_seed_mock_data.sql`
- View SQL:
  `sql/tob-dashboard/v1_views.sql`
- One-command setup:
  `scripts/tob-dashboard/setup-v1.sh`
- Metabase card pack guide:
  `docs/tob-dashboard-v1-metabase-pack.md`
- Metabase query files:
  `sql/tob-dashboard/metabase/v1/*.sql`

---

## 3) Quick Start / 快速启动

```bash
cd /Users/lizbai/Documents/OpenClaw/VibeCoding/LCM-PG

# Optional: ensure DB exists first
createdb lcm_demo 2>/dev/null || true

# Use default URL (postgresql://$(whoami)@localhost:5432/lcm_demo)
scripts/tob-dashboard/setup-v1.sh

# Or pass a URL explicitly
scripts/tob-dashboard/setup-v1.sh "postgresql://user:pass@localhost:5432/lcm_demo"
```

---

## 4) Verification SQL / 验证 SQL

```bash
psql "postgresql://$(whoami)@localhost:5432/lcm_demo" -c \
"select count(*) as mirror_rows from lcm_mirror;"

psql "postgresql://$(whoami)@localhost:5432/lcm_demo" -c \
"select count(*) as shared_rows from shared_knowledge;"

psql "postgresql://$(whoami)@localhost:5432/lcm_demo" -c \
"select * from vw_context_shift_hourly limit 10;"

psql "postgresql://$(whoami)@localhost:5432/lcm_demo" -c \
"select * from vw_topic_trends_daily limit 10;"

psql "postgresql://$(whoami)@localhost:5432/lcm_demo" -c \
"select * from vw_governance_role_matrix;"
```

---

## 5) Recommended Metabase Cards / 推荐 Metabase 卡片

### EN

Build dashboard cards from these views:

- `vw_context_shift_hourly`: line chart by `bucket_hour`, series `agent_id`, metric `shift_score_avg`
- `vw_context_volume_daily`: stacked bars by `day`, grouped by `agent_id`
- `vw_topic_trends_daily`: top tags by `entries`
- `vw_topic_momentum_7d`: table sorted by `delta_7d DESC`
- `vw_governance_visibility_daily`: visibility ratio trend
- `vw_governance_role_matrix`: governance matrix table

### 中文

建议基于以下视图建卡片：

- `vw_context_shift_hourly`：按 `bucket_hour` 的折线图，序列 `agent_id`，指标 `shift_score_avg`
- `vw_context_volume_daily`：按 `day` 的堆叠柱状图（按 `agent_id` 分组）
- `vw_topic_trends_daily`：高频标签排行
- `vw_topic_momentum_7d`：按 `delta_7d` 降序的动量表
- `vw_governance_visibility_daily`：可见性占比趋势
- `vw_governance_role_matrix`：治理权限矩阵表

---

## 6) Notes / 说明

### EN

- Seeder is idempotent on primary keys / unique constraints.
- Re-running setup updates views and appends only non-conflicting mock rows.
- If your environment has strict RLS enabled, run seeding with a DB user that can insert demo rows.

### 中文

- Seed 脚本在主键/唯一键层面可重复执行。
- 重复运行会刷新视图，只插入不冲突的数据。
- 若环境启用了严格 RLS，请使用有插入权限的数据库账号执行演示注入。
