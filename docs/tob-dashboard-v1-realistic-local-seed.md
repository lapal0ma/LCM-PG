# toB Dashboard v1 Realistic Local Seed Workflow
# toB 看板 v1 本地真实感种子数据流程

This document addresses issue #15 requirements:

- OpenClaw -> extract -> scrub -> generate realistic seed **locally**
- keep synthetic default path as public baseline
- never commit raw/PII workspace artifacts to remote

本文用于满足 #15 要求：

- OpenClaw -> 抽取 -> 脱敏 -> 本地生成真实感种子数据
- 公共默认路径仍保持合成数据
- 原始/含 PII 的工作区数据禁止提交远端

---

## 1) Safety Rules (Hard) / 安全铁律

### EN

1. Do not commit raw workspace dumps, copied session logs, credentials, or customer data.
2. Do not commit generated realistic datasets derived from private data.
3. Keep all realistic artifacts in local ignored paths (`.demo-local/...`).
4. Commit only generators, templates, and sanitized examples.

### 中文

1. 禁止提交原始工作区导出、会话日志、凭据、客户数据。
2. 禁止提交由私有数据衍生出的真实感数据集。
3. 所有真实感产物仅放在本地忽略目录（`.demo-local/...`）。
4. 仓库仅提交生成器、模板、脱敏示例。

---

## 2) Default vs Realistic Path / 默认路径 vs 真实感路径

### EN

- Default public path: `scripts/tob-dashboard/setup-v1.sh`
  - uses synthetic seed SQL
  - deterministic and safe for remote collaboration

- Opt-in realistic local path:
  - extract redacted corpus from local OpenClaw SQLite
  - generate local SQL seed
  - optionally apply to local PG

### 中文

- 公共默认路径：`scripts/tob-dashboard/setup-v1.sh`
  - 使用合成种子
  - 可复现且适合远程协作

- 可选真实感本地路径：
  - 从本地 OpenClaw SQLite 抽取脱敏语料
  - 生成本地 SQL 种子
  - 可选择写入本地 PG

---

## 3) Local Pipeline Scripts / 本地流水线脚本

- `scripts/tob-dashboard/local/extract-redacted-corpus.mjs`
  - source: local LCM SQLite (`~/.openclaw/lcm.db` by default)
  - redacts emails/URLs/IP/secret-like tokens/paths/long numbers
  - outputs local JSONL corpus

- `scripts/tob-dashboard/local/generate-realistic-seed-sql.mjs`
  - input: redacted corpus JSONL
  - output: local SQL seed (`*.demo.local.sql`)
  - creates realistic mirror/shared_knowledge inserts

- `scripts/tob-dashboard/local/realistic-seed-v1.sh`
  - one-command wrapper for extract + generate + optional apply

---

## 4) Usage / 使用方式

### EN

Generate local realistic seed (without applying):

```bash
scripts/tob-dashboard/local/realistic-seed-v1.sh \
  --sqlite "$HOME/.openclaw/lcm.db" \
  --out-dir ".demo-local/tob-dashboard" \
  --limit 180 \
  --mirror-rows 320 \
  --shared-rows 60
```

Generate and apply into local PG:

```bash
scripts/tob-dashboard/local/realistic-seed-v1.sh \
  --db-url "postgresql://$(whoami)@localhost:5432/lcm_demo" \
  --apply
```

### 中文

仅生成本地真实感种子（不入库）：

```bash
scripts/tob-dashboard/local/realistic-seed-v1.sh \
  --sqlite "$HOME/.openclaw/lcm.db" \
  --out-dir ".demo-local/tob-dashboard" \
  --limit 180 \
  --mirror-rows 320 \
  --shared-rows 60
```

生成并写入本地 PG：

```bash
scripts/tob-dashboard/local/realistic-seed-v1.sh \
  --db-url "postgresql://$(whoami)@localhost:5432/lcm_demo" \
  --apply
```

---

## 5) Optional LLM Paraphrase Path / 可选 LLM 改写路径

### EN

Optional and local-only:

1. Use redacted corpus output as input text.
2. Ask local/private model to paraphrase for demo narrative tone.
3. Re-run SQL generation from paraphrased corpus.
4. Keep outputs local and ignored by git.

### 中文

可选、且仅限本地：

1. 用脱敏语料作为输入。
2. 让本地/私有模型进行演示风格改写。
3. 用改写后的语料再次生成 SQL。
4. 产物继续留在本地忽略目录。

---

## 6) Git Ignore Coverage / 忽略规则覆盖

These patterns are already ignored:

- `.demo-local/`
- `data/tob-dashboard/local/`
- `sql/tob-dashboard/local-generated/`
- `*.demo.local.sql`
- `*.demo.local.csv`
- `*.demo.local.jsonl`

以下路径已加入忽略规则：

- `.demo-local/`
- `data/tob-dashboard/local/`
- `sql/tob-dashboard/local-generated/`
- `*.demo.local.sql`
- `*.demo.local.csv`
- `*.demo.local.jsonl`
