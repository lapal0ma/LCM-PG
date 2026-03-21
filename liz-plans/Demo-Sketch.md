# LCM-PG Demo Sketch — Multi-Agent Team Coordination (toB)

# LCM-PG 演示方案 — 多 Agent 团队协作（toB 场景）

## Goal / 目标

Demonstrate that LCM-PG's cross-agent shared knowledge layer delivers measurable improvements over vanilla LCM in a realistic **enterprise team** setting where multiple role-specialized agents collaborate on a shared deliverable.

证明 LCM-PG 的跨 Agent 共享知识层在真实的 **企业团队协作** 场景中，相比原版 LCM 能带来可量化的提升：多个角色化 Agent 协同完成同一交付物。

---

## Scenario: Enterprise Cloud Migration Assessment / 场景：企业云迁移评估

A mid-size SaaS company is evaluating migrating its API backend from AWS Lambda to Cloudflare Workers. The CTO needs a decision memo by end of week. The company uses OpenClaw to power a team of AI agents, each assigned to a domain expert role.

一家中型 SaaS 公司正在评估将 API 后端从 AWS Lambda 迁移到 Cloudflare Workers。CTO 需要在周末前拿到决策备忘录。公司使用 OpenClaw 驱动一组 AI Agent，每个 Agent 分配了不同的领域专家角色。

### The Team (Agents) / 团队成员（Agent）

| Agent ID | Role / 角色 | Responsibility / 职责 |
|----------|------|----------------|
| `main` | **Tech Lead 技术负责人 (Admin)** | Orchestrates workflow, reviews all agents' findings via mirror, curates key conclusions into shared knowledge, controls visibility / 编排工作流，通过 mirror 审阅所有 Agent 的发现，精选结论写入共享知识，管控可见性 |
| `infra` | **Infrastructure Engineer 基础设施工程师** | Benchmarks cold start latency, evaluates regional coverage, stress-tests concurrency limits / 压测冷启动延迟、评估区域覆盖、并发上限 |
| `finance` | **FinOps Analyst 成本分析师** | Models cost at 10M / 100M / 1B requests per month, compares pricing tiers, identifies hidden costs / 按 10M/100M/1B 请求量建模成本，对比定价层级，识别隐性费用 |
| `security` | **Security & Compliance 安全合规** | Reviews SOC2/GDPR posture, data residency, network isolation, secret management / 审查 SOC2/GDPR 合规、数据驻留、网络隔离、密钥管理 |
| `devexp` | **Developer Experience Lead 开发者体验负责人** | Evaluates SDK quality, local dev tooling, CI/CD integration, migration effort for existing codebase / 评估 SDK 质量、本地开发工具链、CI/CD 集成、现有代码迁移工作量 |

### Why This Scenario Works for a toB Demo / 为什么这个场景适合 toB 演示

- **Recognizable 受众秒懂**: every tech company does vendor evaluations; the audience gets it instantly / 每家技术公司都做过供应商评估
- **Multi-role 多角色**: demonstrates real-world specialization — no single agent can do everything / 展示真实世界的分工——没有一个 Agent 能包揽一切
- **Information asymmetry 信息不对称**: each agent discovers facts the others need but can't access in vanilla LCM / 各 Agent 发现的关键事实，其他 Agent 在原版 LCM 中无法获取
- **Visible outcome 结果可衡量**: a single decision memo that either contains all findings or doesn't — easy to grade / 最终产出一份决策备忘录，信息完整度一目了然

---

## Workflow: Side-by-Side Comparison / 工作流：对照实验

### Phase 1 — Independent Research (identical in both setups) / 阶段一：独立调研（两组相同）

Each agent receives domain-specific tasks from the user:

每个 Agent 从用户处接收领域专项任务：

```
User → infra:    "Benchmark cold start: Lambda vs Workers. Test with 256MB/1GB configs."
User → finance:  "Model cost comparison at 10M, 100M, 1B req/month. Include bandwidth."
User → security: "Compare SOC2 compliance: AWS Lambda vs Cloudflare Workers."
User → devexp:   "Evaluate migration effort: our Express.js API to Workers."
```

Each agent researches independently for 6–8 turns, accumulating detailed findings. Compaction fires, summaries are created.

每个 Agent 独立调研 6–8 轮，积累详细发现。Compaction 触发，摘要生成。

**At this point, in both setups, each agent is an expert in their domain — but knows nothing about the others' findings.**

**此时两组实验中，每个 Agent 都是自己领域的专家——但对其他 Agent 的发现一无所知。**

### Phase 2 — Knowledge Transfer (THE DIVERGENCE) / 阶段二：知识传递（分歧点）

#### Baseline (Vanilla LCM) / 对照组（原版 LCM）

The user must **manually relay** information between agents:

用户必须**手动传话**，在 Agent 之间搬运信息：

```
User reads infra's findings → copies key numbers
User → finance: "FYI, infra found Workers cold start is 0ms vs Lambda 300-800ms.
                  Factor this into TCO since we can drop the keep-warm hack."
User reads finance's findings → copies cost table
User → security: "Finance says Workers is 40% cheaper at 100M req/month.
                   But check if their Enterprise plan includes the WAF we need."
User reads security's findings → copies compliance gaps
User → devexp:   "Security flagged that Workers lacks VPC peering. Check if
                   our auth service can work without it."
```

Problems / 问题：
- User becomes the bottleneck (N² relay messages) / 用户成为瓶颈（N² 条传话消息）
- Information degrades with each manual copy (telephone game) / 信息在每次手动复制中退化（传话游戏效应）
- Some findings are forgotten or deemed "not relevant" by the user, creating blind spots / 部分发现被遗忘或被用户判定"不相关"，形成信息盲区

#### LCM-PG / 实验组（LCM-PG）

```
# Tech Lead reviews all agents' compaction summaries (auto-mirrored to PG)
main: lcm_mirror_search(query="cold start latency benchmark results")
main: lcm_mirror_search(query="cost comparison Workers Lambda")
main: lcm_mirror_search(query="compliance gaps Cloudflare")
main: lcm_mirror_search(query="migration effort estimate")

# Tech Lead curates cross-team knowledge
main: lcm_shared_knowledge_write(
  content="Workers: 0ms cold start vs Lambda 300-800ms. Eliminates keep-warm cost ($2.4k/mo).",
  visibility="shared",
  tags=["benchmark", "latency"]
)
main: lcm_shared_knowledge_write(
  content="At 100M req/month: Workers $3,200/mo vs Lambda $5,400/mo (excl. bandwidth).",
  visibility="shared",
  tags=["cost", "comparison"]
)
main: lcm_shared_knowledge_write(
  content="Compliance gap: Workers lacks VPC peering and HIPAA BAA. SOC2 Type II is available.",
  visibility="restricted",
  visibleTo=["security", "infra"],
  tags=["compliance", "risk"]
)

# Assign roles for fine-grained access
main: lcm_manage_roles(action="assign", agentId="finance", role="cost-analyst")
main: lcm_manage_roles(action="assign", agentId="security", role="compliance-reviewer")
```

Now when any agent's `assemble` runs, shared knowledge is **automatically injected** into their context. No user relay needed.

此后任何 Agent 的 `assemble` 执行时，共享知识会**自动注入**其上下文。无需用户传话。

### Phase 3 — Cross-Functional Synthesis / 阶段三：跨职能综合

```
User → finance:  "Given all the team's findings, build a 3-year TCO model."
User → devexp:   "Estimate migration timeline factoring in the compliance constraints
                   the security team identified."
User → main:     "Write the decision memo for the CTO."
```

#### Baseline Result / 对照组结果

- `finance` builds TCO without knowing about the compliance gap (missing WAF cost) / `finance` 在不知合规缺口的情况下建模 TCO（遗漏 WAF 成本）
- `devexp` estimates timeline without knowing cold start eliminates a whole subsystem / `devexp` 在不知冷启动优势的情况下估算迁移周期（多算了 keep-warm 子系统）
- `main` writes memo based only on what the user manually relayed — incomplete picture / `main` 仅凭用户手动转发的片段写备忘录——信息不完整

#### LCM-PG Result / 实验组结果

- `finance` sees the compliance gap via shared knowledge → adds WAF cost to TCO / `finance` 通过共享知识看到合规缺口 → 在 TCO 中加入 WAF 成本
- `devexp` sees latency benchmark → removes keep-warm logic from migration plan, saving 2 weeks / `devexp` 看到延迟基准 → 从迁移计划中移除 keep-warm 逻辑，节省 2 周
- `main` sees ALL curated knowledge → writes comprehensive, cross-referenced memo / `main` 看到全部精选知识 → 写出完整、交叉引用的决策备忘录

---

## Evaluation Metrics / 评估指标

### Tier 1 — Functional Quality (most compelling) / 第一梯队：功能质量（最有说服力）

| Metric / 指标 | How to Measure / 测量方法 | Expected Baseline / 对照组预期 | Expected LCM-PG / 实验组预期 |
|--------|---------------|-------------------|------------------|
| **Information Completeness 信息完整度** | Count: how many of the 4 agents' key findings appear in the final CTO memo? / 4 个 Agent 的关键发现有多少出现在最终备忘录中？ | 4–6 / 12 | 10–12 / 12 |
| **Cross-Reference Accuracy 交叉引用准确率** | Does the TCO model account for latency savings? Does the timeline reflect compliance constraints? / TCO 是否考虑了延迟节省？时间线是否反映了合规约束？ | 0–1 | 3–4 |
| **Human Relay Count 人工传话次数** | Messages where the user manually copies info between agents / 用户手动在 Agent 间复制信息的消息数 | 8–12 | 0 |
| **Factual Errors 事实错误** | Incorrect numbers, misattributed claims in the final memo / 最终备忘录中的错误数字、错误归因 | 2–4 | 0–1 |

### Tier 2 — Efficiency / 第二梯队：效率

| Metric / 指标 | How to Measure / 测量方法 | Expected Baseline / 对照组 | Expected LCM-PG / 实验组 |
|--------|---------------|-------------------|------------------|
| **Total Tokens 总 Token 消耗** | Sum input + output tokens across ALL agents / 所有 Agent 的输入+输出 Token 总和 | ~200k（传话膨胀） | ~120k |
| **Total Turns 总轮次** | Count of `openclaw agent` calls across all agents / 所有 Agent 的调用总次数 | 30–35 | 18–22 |
| **Wall Clock Time 挂钟时间** | Stopwatch from first task to final memo / 从下发任务到最终备忘录的总耗时 | ~60 min | ~30 min |
| **User Active Time 用户主动操作时间** | Time user spends composing messages (excludes agent thinking) / 用户撰写消息的时间（不含 Agent 思考） | ~25 min | ~10 min |

### Tier 3 — Governance & Architecture / 第三梯队：治理与架构

| Metric / 指标 | How to Measure / 测量方法 | Expected / 预期 |
|--------|---------------|----------|
| **Access Control 访问控制** | `devexp` cannot see compliance-restricted entries / `devexp` 无法看到合规受限条目 | Pass/Fail |
| **Audit Trail 审计追踪** | `lcm_mirror` has complete history of all agents' summaries / `lcm_mirror` 中有所有 Agent 摘要的完整历史 | PG 行数 |
| **Graceful Degradation 优雅降级** | Disable PG mid-session; agents still work (SQLite primary) / 会话中途关闭 PG，Agent 仍正常工作 | 无崩溃无报错 |

### Token Savings Explanation / Token 节省原理

In vanilla LCM, the user relay pattern inflates tokens:

原版 LCM 中，用户传话模式导致 Token 膨胀：

```
Turn N:   User pastes 500-token summary from Agent A into Agent B's conversation
          用户将 Agent A 的 500 token 摘要粘贴到 Agent B 的对话中
Turn N+1: Agent B's assemble includes those 500 tokens in context
          Agent B 的 assemble 将这 500 token 纳入上下文
Turn N+2: User pastes 300-token update, now 800 tokens of relay in B's context
          用户再粘贴 300 token 更新，B 的上下文中已有 800 token 的传话内容
...repeat for each agent pair / 对每对 Agent 重复以上过程
```

With LCM-PG, `assemble` injects only the **curated, deduplicated** shared knowledge — typically 20–30% of the raw relay volume — with a hard token cap.

LCM-PG 的 `assemble` 仅注入**经过精选、去重**的共享知识——通常是原始传话体积的 20–30%——并有硬性 Token 上限。

---

## Implementation Prerequisites / 实现前置条件

This demo requires **FW-M4** to be complete:

完整演示需要 **FW-M4** 里程碑完成：

| Component / 组件 | Status / 状态 | Needed For / 用于 |
|-----------|--------|------------|
| `lcm_mirror` write path / 镜像写入 | **Done 已完成** (M0–M3) | Phase 1: summaries flow to PG / 阶段一：摘要写入 PG |
| `lcm_mirror_search` tool / 镜像搜索工具 | M4 (not started / 未开始) | Phase 2: admin reads mirror / 阶段二：管理员查阅镜像 |
| `lcm_shared_knowledge_write` / 共享知识写入 | M4 (not started / 未开始) | Phase 2: admin curates / 阶段二：管理员精选 |
| `lcm_shared_knowledge_search` / 共享知识搜索 | M4 (not started / 未开始) | Phase 3: agents query / 阶段三：Agent 查询共享知识 |
| `assemble` PG injection / 上下文注入 | M4 (not started / 未开始) | Phase 3: auto-inject / 阶段三：自动注入上下文 |
| `lcm_manage_roles` / 角色管理 | M4 (not started / 未开始) | Phase 2: role-based visibility / 阶段二：基于角色的可见性 |

### Partial Demo (Works Today, M0–M3 Only) / 部分演示（当前可用，仅 M0–M3）

Without M4, you can still show the **data availability** story:

没有 M4 也可以演示**数据可达性**的故事：

1. Run multi-agent conversations → compaction fires / 运行多 Agent 对话 → 触发 compaction
2. Open `psql`, show `lcm_mirror` rows from different agents side by side / 打开 `psql`，并排展示不同 Agent 的 `lcm_mirror` 行
3. Point: *"In vanilla LCM, each agent's knowledge is locked in its own SQLite file. No other agent, no dashboard, no compliance tool can see it. With LCM-PG, it's already in PostgreSQL — queryable, archivable, and ready for cross-agent sharing once M4 lands."* / 要点：*"原版 LCM 中，每个 Agent 的知识被锁在自己的 SQLite 文件里。其他 Agent、仪表盘、合规工具都看不到。LCM-PG 让它已经进了 PostgreSQL——可查询、可归档，M4 完成后即可跨 Agent 共享。"*

---

## Demo Script Outline / 演示脚本大纲

```
1. [2 min]  Intro / 开场
            "Vanilla LCM = brilliant memory for ONE agent. But teams have many agents."
            "原版 LCM = 单个 Agent 的完美记忆。但团队有多个 Agent。"

2. [5 min]  Show the 5-agent team setup. Explain the migration assessment task.
            展示 5 个 Agent 的团队配置。讲解云迁移评估任务。

3. [10 min] Run Phase 1 in parallel (pre-recorded or live with low threshold).
            并行运行阶段一（预录或低阈值实时演示）。

4. [5 min]  Baseline: show the painful manual relay loop. Count the messages.
            对照组：展示痛苦的人工传话循环。统计消息数。

5. [10 min] LCM-PG: show admin mirror search → curate → role assignment.
            实验组：展示管理员镜像搜索 → 精选 → 角色分配。

6. [5 min]  Phase 3: tech lead writes memo. Compare the two memos side by side.
            阶段三：技术负责人写备忘录。两份备忘录并排对比。

7. [3 min]  Show the scorecard. Highlight: 0 human relay, 12/12 findings, 40% fewer tokens.
            展示评分卡。亮点：0 次人工传话、12/12 关键发现、Token 节省 40%。

8. [5 min]  Bonus: show PG audit trail, access control demo, graceful degradation.
            彩蛋：PG 审计追踪、访问控制演示、优雅降级。
```

Total / 总计: ~45 minutes with Q&A / 含问答约 45 分钟。

---

## Headline Claim / 核心主张

> **"Vanilla LCM gives each agent perfect memory. LCM-PG gives the whole team a shared brain."**
>
> **"原版 LCM 让每个 Agent 拥有完美记忆。LCM-PG 让整个团队共享一个大脑。"**

The demo proves it with numbers: **0 human relay messages, 2× information completeness, 40% token savings** — in a scenario every enterprise engineering team recognizes.

用数据说话：**0 次人工传话、信息完整度翻倍、Token 节省 40%**——场景是每个企业技术团队都熟悉的供应商评估。

---

## Related Documents / 相关文档

- [LCM-PG-PLUG.md](./LCM-PG-PLUG.md) — multi-tenant architecture proposal / 多租户架构提案
- [LCM-PG-fw-validation.md](./LCM-PG-fw-validation.md) — validation plan (Layers 1–4 done, M4 pending) / 验证计划
- [Layer3-validation-log.md](./Layer3-validation-log.md) — e2e test results / 端到端测试结果
- [LCM-PG-fast-workround.md](./LCM-PG-fast-workround.md) — SQLite + PG shared layer design / SQLite + PG 共享层设计
