# toB Dashboard v1 Metabase Pack
# toB 看板 v1 Metabase 查询与卡片包

This document is Step 2 of implementation:
- Step 1: SQL views + synthetic seeding
- Step 2: Metabase query/card pack (this file)

本文是实施第 2 步：
- 第 1 步：SQL 视图 + 模拟数据注入
- 第 2 步：Metabase 查询与卡片包（本文）

---

## 1) Prerequisite / 前置条件

Run Step 1 first:

```bash
scripts/tob-dashboard/setup-v1.sh
```

Then connect Metabase to the same PostgreSQL database (`lcm_demo` by default).

---

## 1.1 Chinese-first Presenter Mode / 中文优先演示模式

### EN

For China stakeholder demos, prefer Chinese presentation labels:

1. Set Metabase language to Chinese where available:
   - Admin -> Settings -> Localization (or account-level language setting)
2. Use Chinese dashboard/tab/card names.
3. Prefer Chinese axis/legend labels via:
   - Metabase display-name overrides, or
   - SQL aliases (e.g. `AS "快照时间"`).

Out of scope: full product UI translation across all Metabase versions.

### 中文

面向国内汇报时，建议采用中文优先展示：

1. 若版本支持，将 Metabase 语言设置为中文：
   - 管理后台 -> 设置 -> 本地化（或账号语言设置）
2. 看板/分栏/卡片标题尽量中文化。
3. 坐标轴与图例优先中文：
   - 在 Metabase 中改显示名，或
   - 在 SQL 中直接使用中文别名（如 `AS "快照时间"`）。

说明：Metabase 产品 UI 是否完整汉化受版本影响，不属于本仓库控制范围。

---

## 2) Dashboard Tabs / 看板分栏

Create one dashboard with 3 tabs:

1. `Context Shift`
2. `Knowledge Topics`
3. `Governance`

建议使用一个 Dashboard，分 3 个标签页：

1. `Context Shift`
2. `Knowledge Topics`
3. `Governance`

---

## 3) Card Catalog (Exact Mapping) / 卡片清单（精确映射）

| Card # | Query File | Tab | Visualization | Config (important) |
|---|---|---|---|---|
| 01 | `sql/tob-dashboard/metabase/v1/01_kpi_overview.sql` | Context Shift | Table (single row) | Show as KPI-style summary block |
| 02 | `sql/tob-dashboard/metabase/v1/02_context_shift_trend.sql` | Context Shift | Line | X=`bucket_hour`, Y=`shift_score_avg`, Breakout=`agent_id` |
| 03 | `sql/tob-dashboard/metabase/v1/03_context_volume_daily.sql` | Context Shift | Stacked bar | X=`day`, Y=`snapshots`, Breakout=`agent_id` |
| 04 | `sql/tob-dashboard/metabase/v1/04_context_latest_snapshots.sql` | Context Shift | Table | Sort `captured_at desc`; keep columns concise |
| 05 | `sql/tob-dashboard/metabase/v1/05_topic_top_tags_30d.sql` | Knowledge Topics | Horizontal bar | Y=`tag`, X=`entries_30d`, sort descending |
| 06 | `sql/tob-dashboard/metabase/v1/06_topic_daily_trend_top8.sql` | Knowledge Topics | Stacked area (or multi-line) | X=`day`, Y=`entries`, Breakout=`tag` |
| 07 | `sql/tob-dashboard/metabase/v1/07_topic_momentum_7d.sql` | Knowledge Topics | Table | Sort `delta_7d desc` |
| 10 | `sql/tob-dashboard/metabase/v1/10_recent_curated_knowledge.sql` | Knowledge Topics | Table | Sort `updated_at desc`; include visibility + tags |
| 08 | `sql/tob-dashboard/metabase/v1/08_governance_visibility_daily.sql` | Governance | Stacked bar | X=`day`, Y=`shared/restricted/private` |
| 09 | `sql/tob-dashboard/metabase/v1/09_governance_role_matrix.sql` | Governance | Table | Sort by `agent_id`, `role` |

---

## 4) Recommended Layout / 推荐布局

### EN

`Context Shift` tab:
- Top row: Card 01 (full width KPI)
- Mid row: Card 02 (left, 2/3) + Card 03 (right, 1/3)
- Bottom row: Card 04 (full width table)

`Knowledge Topics` tab:
- Top row: Card 05 (left, 1/2) + Card 07 (right, 1/2)
- Mid row: Card 06 (full width trend)
- Bottom row: Card 10 (full width table)

`Governance` tab:
- Top row: Card 08 (left, 1/2) + Card 09 (right, 1/2)

### 中文

`Context Shift` 页：
- 顶部：卡片 01（整行 KPI）
- 中部：卡片 02（左侧 2/3）+ 卡片 03（右侧 1/3）
- 底部：卡片 04（整行明细表）

`Knowledge Topics` 页：
- 顶部：卡片 05（左 1/2）+ 卡片 07（右 1/2）
- 中部：卡片 06（整行趋势图）
- 底部：卡片 10（整行明细表）

`Governance` 页：
- 顶部：卡片 08（左 1/2）+ 卡片 09（右 1/2）

---

## 5) Optional Dashboard Filters / 可选全局筛选

### EN

For v1 simplicity, queries already scope to recent windows (e.g. 30d/72h).
You may still add UI filters:
- Date range (for tabs with `day`/`bucket_hour`)
- Agent (for context views)
- Visibility (for governance and recent knowledge table)

### 中文

v1 以简洁为主，查询已内置时间窗口（如 30 天、72 小时）。
如需可加 UI 全局筛选：
- 时间范围（`day`/`bucket_hour`）
- Agent（上下文页）
- Visibility（治理与知识明细页）

---

## 6) Demo Talk Track Binding / 与演示话术绑定

### EN

- “Context is shifting and traceable” -> Cards 02 + 04
- “Knowledge gets structured into reusable topics” -> Cards 05 + 06 + 07
- “Governance is visible and auditable” -> Cards 08 + 09 + 10

### 中文

- “上下文变化可追踪” -> 卡片 02 + 04
- “知识被结构化并可复用” -> 卡片 05 + 06 + 07
- “治理状态可见且可审计” -> 卡片 08 + 09 + 10

---

## 7) Quick Build Checklist / 快速搭建清单

1. Run `scripts/tob-dashboard/setup-v1.sh`.
2. In Metabase, create 10 native SQL questions from the query files above.
3. Set visualization exactly per table in §3.
4. Assemble into the 3-tab dashboard per §4.
5. Save dashboard as: `LCM-PG toB Dashboard v1`.
6. For Chinese-first demos, apply the checklist in `docs/tob-dashboard-v1-chinese-presenter-checklist.md`.

1. 执行 `scripts/tob-dashboard/setup-v1.sh`。
2. 在 Metabase 中用上述 SQL 文件创建 10 个原生查询问题。
3. 按第 3 节设置图表类型与字段。
4. 按第 4 节组装成 3 个分栏的 Dashboard。
5. 保存名称：`LCM-PG toB Dashboard v1`。
6. 若为中文汇报，请按 `docs/tob-dashboard-v1-chinese-presenter-checklist.md` 做最终标题与话术校对。

---

## 8) Chinese Alias Examples / 中文别名示例

### EN

Optional sample queries with Chinese column aliases are provided in:

- `sql/tob-dashboard/metabase/v1/zh/`

These are presenter-focused examples and do not replace the canonical EN queries.

### 中文

可选中文列别名示例位于：

- `sql/tob-dashboard/metabase/v1/zh/`

该目录用于演示呈现，不替代英文标准查询。
