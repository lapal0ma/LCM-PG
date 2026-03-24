# toB Dashboard v1 Demo-Day Checklist
# toB 看板 v1 演示日检查清单

Use this checklist right before stakeholder demos.
用于正式演示前的最后检查。

---

## 1) T-30 min: Environment / 环境检查

### EN

1. Confirm PostgreSQL is running.
2. Confirm target DB is reachable (`lcm_demo` by default).
3. Confirm repo branch is the approved demo branch.

### 中文

1. 确认 PostgreSQL 服务已启动。
2. 确认目标数据库可连接（默认 `lcm_demo`）。
3. 确认当前仓库在已批准的演示分支。

---

## 2) T-20 min: Data + View Setup / 数据与视图准备

Run:

```bash
cd /Users/lizbai/Documents/OpenClaw/VibeCoding/LCM-PG
scripts/tob-dashboard/setup-v1.sh
```

Expected:

- mock rows inserted (idempotent)
- dashboard views created/updated

---

## 3) T-15 min: QA Gate / QA 闸门

Run:

```bash
scripts/tob-dashboard/qa-v1.sh
```

Pass criteria (default thresholds):

- `lcm_mirror` rows >= 200
- `shared_knowledge` rows >= 40
- role rows >= 4
- distinct tags (30d) >= 8
- restricted entries (30d) >= 1
- shift spikes (72h) >= 2

Custom thresholds (optional):

```bash
MIRROR_MIN_ROWS=180 TAGS_MIN_COUNT=10 scripts/tob-dashboard/qa-v1.sh
```

---

## 4) T-10 min: Dashboard Spot Check / 看板抽查

Open Metabase dashboard `LCM-PG toB Dashboard v1` and verify:

1. Context Shift line chart renders (per-agent series visible).
2. Top Tags card has at least 8 tags.
3. Governance visibility chart shows restricted entries.
4. Recent curated knowledge table is non-empty.

打开 Metabase 看板 `LCM-PG toB Dashboard v1` 并确认：

1. Context Shift 折线图正常展示（按 agent 分组）。
2. Top Tags 至少显示 8 个标签。
3. Governance 可见性图中存在 restricted 数据。
4. 最新知识明细表非空。

---

## 5) T-5 min: Narrative Alignment / 话术校准

Use this 3-point narrative:

1. Context shift is measurable (`vw_context_shift_hourly`).
2. Knowledge topics are structured via tags (`vw_topic_trends_daily`).
3. Governance is auditable (`vw_governance_visibility_daily`, `vw_governance_role_matrix`).

演示话术建议 3 点：

1. 上下文迁移可量化（`vw_context_shift_hourly`）。
2. 主题通过标签结构化（`vw_topic_trends_daily`）。
3. 治理状态可审计（`vw_governance_visibility_daily`、`vw_governance_role_matrix`）。

---

## 6) One-Command Option / 一键执行

If you want setup + QA in one command:

```bash
scripts/tob-dashboard/demo-ready-v1.sh
```

若希望一键完成“准备 + QA”：

```bash
scripts/tob-dashboard/demo-ready-v1.sh
```

---

## 7) Fallback Playbook / 兜底预案

### EN

- If DB is unavailable: switch to pre-captured screenshots + previously exported CSV metrics.
- If tags are too sparse: rerun setup seeder and refresh Metabase cache.
- If chart render is slow: reduce dashboard time window from 30d to 7d for live demo.

### 中文

- 如果数据库不可用：切换到预先导出的截图与 CSV 指标。
- 如果标签分布稀疏：重新执行 seed，并刷新 Metabase 缓存。
- 如果图表加载慢：现场将时间窗口从 30 天缩短到 7 天。
