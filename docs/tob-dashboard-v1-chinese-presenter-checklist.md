# 中文看板演示检查清单（toB v1）

用于国内汇报场景的快速对照清单：卡片标题建议 + 三句话话术。

---

## 1) 看板与分栏命名建议

- Dashboard：`LCM-PG 企业协同看板 v1`
- Tab 1：`上下文迁移`
- Tab 2：`知识主题`
- Tab 3：`治理审计`

---

## 2) 卡片标题速查表（中英对照）

| Card # | 英文默认名 | 中文建议标题 |
|---|---|---|
| 01 | KPI Overview | 全局指标总览 |
| 02 | Context Shift Trend by Agent | 上下文迁移趋势（按 Agent） |
| 03 | Context Volume Daily | 上下文体量（日） |
| 04 | Latest Mirror Snapshots | 最新镜像快照明细 |
| 05 | Top Topic Tags (30d) | 热门主题标签（30天） |
| 06 | Topic Daily Trend (Top 8) | 主题趋势（Top 8） |
| 07 | Topic Momentum (7d) | 主题动量（近7天 vs 前7天） |
| 08 | Governance Visibility Mix | 治理可见性分布 |
| 09 | Governance Role Matrix | 角色权限矩阵 |
| 10 | Recent Curated Knowledge | 最新精选知识 |

---

## 3) 列名中文化建议（示例）

优先使用 Metabase 显示名改写；若需在 SQL 里直接中文化，可参考：

- `bucket_hour` -> `快照时间`
- `agent_id` -> `Agent`
- `shift_score_avg` -> `平均迁移分数`
- `entries_30d` -> `30天条目数`
- `restricted_ratio` -> `受限占比`

可选 SQL 示例见：

- `sql/tob-dashboard/metabase/v1/zh/`

---

## 4) 三句话话术（2分钟版开场）

1. 「第一部分我们看上下文迁移：每个 Agent 的记忆变化是否稳定、可追踪。」
2. 「第二部分看知识主题：信息有没有沉淀成可复用的结构化主题，而不是散落在对话里。」
3. 「第三部分看治理审计：谁能看、谁能改、哪些是受限知识，现场可验证。」

---

## 5) 演示前 60 秒核对

1. Metabase 语言是否已设为中文（若版本支持）
2. 三个分栏是否为中文名
3. Top 标签卡是否至少展示 8 个标签
4. 治理页是否能看到 restricted 数据
5. 最新精选知识表是否非空
