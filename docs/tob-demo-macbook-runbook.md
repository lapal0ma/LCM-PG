# LCM-PG toB Demo Runbook (MacBook Fast Path)

This runbook gives a practical demo path that runs quickly and with low risk on a MacBook.

## Demo Target

Show the difference between:

- Baseline: user manually relays findings between specialist agents.
- LCM-PG: admin agent curates mirror findings into shared knowledge, then other agents consume it automatically via assemble/tool search.

Use the same business scenario:

- Enterprise cloud migration memo (Lambda -> Workers).

## Track A: 5-10 Minute "Proof Mode" (Most Stable)

Use this for internal validation or backup during live demo.

1. Start local PostgreSQL (Homebrew):

```bash
brew services start postgresql@16 || brew services start postgresql
createdb lcm_demo 2>/dev/null || true
```

2. Run fast tool/unit checks:

```bash
npm test -- test/lcm-m4-tools.test.ts
```

3. Run PG-backed integration checks:

```bash
TEST_PG_URL=postgresql://$(whoami)@localhost:5432/lcm_demo \
  npm test -- test/pg-reader.test.ts test/shared-knowledge-e2e.test.ts
```

Expected outcome:

- `lcm_m4_tools` tests pass.
- PG integration tests validate:
  - mirror search partial-failure handling
  - role CRUD
  - shared knowledge write/read visibility
  - wildcard-escaping behavior (`%`, `_`) in search

## Track B: 20-30 Minute Live toB Demo

## 1) Preflight (Terminal A)

```bash
cd /Users/lizbai/Documents/OpenClaw/VibeCoding/LCM-PG

brew services start postgresql@16 || brew services start postgresql
createdb lcm_demo 2>/dev/null || true

alias oc='openclaw --profile lcm-demo'

export LCM_MIRROR_ENABLED=true
export LCM_MIRROR_DATABASE_URL=postgresql://$(whoami)@localhost:5432/lcm_demo
export LCM_SHARED_KNOWLEDGE_ENABLED=true
export LCM_ASSEMBLE_SHARED_KNOWLEDGE=true

# Force compaction early for demo speed
export LCM_CONTEXT_THRESHOLD=0.05
export LCM_FRESH_TAIL_COUNT=8
export LCM_INCREMENTAL_MAX_DEPTH=1

# Demo role bootstrap
export LCM_ADMIN_AGENT_IDS=main
export LCM_ROLE_BOOTSTRAP_MAP='{"main":["admin"],"infra":["researcher"],"finance":["cost-analyst"],"security":["compliance-reviewer"]}'

oc plugins install --link /Users/lizbai/Documents/OpenClaw/VibeCoding/LCM-PG
oc gateway --force
```

Keep this terminal running.

## 2) Agent setup (Terminal B, one-time)

```bash
oc agents add infra --non-interactive --workspace "$HOME/.openclaw-lcm-demo/workspaces/infra" || true
oc agents add finance --non-interactive --workspace "$HOME/.openclaw-lcm-demo/workspaces/finance" || true
oc agents add security --non-interactive --workspace "$HOME/.openclaw-lcm-demo/workspaces/security" || true
```

## 3) Seed specialist conversations (Terminal B)

Use short but dense prompts so compaction triggers quickly.

```bash
oc agent --local --agent infra --session-id demo-infra --message "You are Infra Lead. Dataset: Lambda cold start p50 320ms p95 820ms; Workers cold start p50 3ms p95 12ms; keep-warm cron currently costs $2400/month and adds operational burden. Produce: benchmark summary, risk list, and migration infra recommendation."

oc agent --local --agent finance --session-id demo-finance --message "You are FinOps. Dataset: 100M req/month: Lambda $5400, Workers $3200; 1B req/month: Lambda $46200, Workers $28900; egress and WAF not included. Produce: TCO table and sensitivity analysis."

oc agent --local --agent security --session-id demo-security --message "You are Security. Dataset: both have SOC2 Type II; Workers lacks native VPC peering in our current architecture and HIPAA BAA in this plan; secret rotation available in both. Produce: compliance gap report with severity."
```

Add one follow-up turn to each specialist:

```bash
oc agent --local --agent infra --session-id demo-infra --message "Refine with exact assumptions and top 3 architecture changes."
oc agent --local --agent finance --session-id demo-finance --message "Add 3-year TCO and break-even logic with assumptions."
oc agent --local --agent security --session-id demo-security --message "List mandatory controls before go-live."
```

## 4) Validate mirror rows landed (Terminal C)

```bash
psql postgresql://$(whoami)@localhost:5432/lcm_demo -c \
"SELECT agent_id, COUNT(*) AS rows, MAX(captured_at) AS latest FROM lcm_mirror GROUP BY agent_id ORDER BY rows DESC;"
```

If rows are missing, add one more turn per specialist and re-check.

## 5) Admin curation flow (main agent)

Run in Terminal B:

```bash
oc agent --local --agent main --session-id demo-main --message "Use lcm_manage_roles(action='list') and report current role assignments."

oc agent --local --agent main --session-id demo-main --message "Use lcm_mirror_search to find latency/cold-start findings from all agents. Return top rows and a concise synthesis."

oc agent --local --agent main --session-id demo-main --message "Write curated shared knowledge entry for latency and keep-warm removal using lcm_shared_knowledge_write. Use visibility='shared' and tags ['latency','benchmark','migration']."

oc agent --local --agent main --session-id demo-main --message "Write curated cost entry with visibility='shared' tags ['cost','tco']."

oc agent --local --agent main --session-id demo-main --message "Write curated compliance-risk entry with visibility='restricted' and visibleTo ['compliance-reviewer'] tags ['compliance','risk']."
```

## 6) Visibility and synthesis checks

Security agent should see restricted compliance entry:

```bash
oc agent --local --agent security --session-id demo-security --message "Use lcm_shared_knowledge_search(query='compliance risk') and summarize what you can access."
```

Finance agent should not see restricted compliance entry:

```bash
oc agent --local --agent finance --session-id demo-finance --message "Use lcm_shared_knowledge_search(query='compliance risk') and summarize what you can access."
```

Create final CTO memo:

```bash
oc agent --local --agent main --session-id demo-main --message "Draft a CTO decision memo: recommendation, 3-year TCO impact, compliance constraints, migration timeline, and explicit risks."
```

## 7) Suggested scorecard slide

- Information completeness: count how many specialist findings appear in final memo.
- Cross-reference quality: latency impacts reflected in cost/timeline.
- Human relay count: manual copy-paste between agents (target: 0 in LCM-PG flow).
- Access control: restricted compliance entry visible to security, hidden from finance.

## Fallbacks for smooth live delivery

- If live model latency is high, run Track A immediately and continue narrative on top.
- If mirror table is empty, lower threshold and add one extra dense turn per specialist.
- If admin authorization fails, confirm `main` has `admin` role via bootstrap map and `lcm_manage_roles(action='list')`.
- If shared knowledge does not appear in assemble, force explicit retrieval with `lcm_shared_knowledge_search`.
