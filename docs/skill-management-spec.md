# Skill Management SPEC / SKILL 管理规范

Status: Draft
Audience: OpenClaw agents, plugin authors, skill authors, and maintainers
Scope: How LCM-PG/OpenClaw-adjacent projects should define, store, discover, review, and evolve `SKILL.md` playbooks.

---

## 1. Purpose

Skills are task-oriented playbooks for agents. A skill should explain how an agent should use available tools, knowledge, policies, and examples to complete a recurring task safely and consistently.

This SPEC defines:

- The boundary between tools, skills, knowledge, memory, and policy.
- The expected structure of a `SKILL.md`.
- How skills should be registered, versioned, reviewed, and deprecated.
- Quality gates for turning an ad hoc workflow into a reusable agent skill.

This SPEC does not define the low-level MCP tool protocol itself.

## 1. 目标

Skill 是面向任务的 agent 操作手册。一个 skill 应该说明 agent 如何组合已有工具、知识、规则和示例，稳定、安全地完成一类重复任务。

本规范定义：

- Tool、Skill、Knowledge、Memory、Policy 的边界。
- `SKILL.md` 的推荐结构。
- Skill 的注册、版本、评审和废弃流程。
- 如何判断一个临时 workflow 是否已经成熟到可以沉淀为 reusable skill。

本规范不定义底层 MCP tool 协议本身。

---

## 2. Core Concepts

### 2.1 Tool

A tool is an executable capability exposed to an agent. It is usually a small API with typed inputs and outputs, such as `get_unclassified_emails`, `save_payment_transaction`, or `lcm_shared_knowledge_search`.

Tools should answer: "What can the agent call?"

### 2.2 Skill

A skill is a task playbook that tells an agent when, why, and how to use tools. It includes task intent, decision rules, safety boundaries, workflows, examples, and failure handling.

Skills should answer: "How should the agent solve this class of tasks?"

### 2.3 Knowledge

Knowledge is reference material used by a skill or agent, such as product docs, previous decisions, schemas, glossary entries, or domain-specific facts.

Knowledge should answer: "What does the agent need to know?"

### 2.4 Memory

Memory is persisted user/project state that changes over time, such as preferences, prior classifications, historical decisions, or repeated corrections.

Memory should answer: "What should the agent remember from previous work?"

### 2.5 Policy

Policy is mandatory behavior. It constrains what the agent may do, especially around privacy, security, financial actions, destructive operations, and external communication.

Policy should answer: "What must or must not happen?"

## 2. 核心概念

### 2.1 Tool

Tool 是 agent 可以调用的可执行能力，通常是输入输出清晰的小 API，例如 `get_unclassified_emails`、`save_payment_transaction`、`lcm_shared_knowledge_search`。

Tool 回答的问题是：“agent 能调用什么？”

### 2.2 Skill

Skill 是任务手册，告诉 agent 什么时候、为什么、如何使用工具。它应该包含任务意图、决策规则、安全边界、工作流、示例和失败处理方式。

Skill 回答的问题是：“agent 应该如何完成这一类任务？”

### 2.3 Knowledge

Knowledge 是 skill 或 agent 可引用的资料，例如产品文档、历史决策、schema、术语表、领域事实。

Knowledge 回答的问题是：“agent 需要知道什么？”

### 2.4 Memory

Memory 是会随时间变化的持久化状态，例如用户偏好、历史分类、曾经的判断、反复纠正过的规则。

Memory 回答的问题是：“agent 应该从过去的工作里记住什么？”

### 2.5 Policy

Policy 是强制行为约束，尤其用于隐私、安全、财务操作、破坏性操作和对外沟通。

Policy 回答的问题是：“什么必须做，什么绝不能做？”

---

## 3. Skill Registry

OpenClaw should treat installed skills as registry entries, not as random Markdown files. A registry entry should include:

| Field | Required | Description |
|---|---:|---|
| `id` | Yes | Stable skill identifier, for example `icloud-mail` |
| `name` | Yes | Human-readable skill name |
| `version` | Yes | Skill content version, independent from tool implementation version |
| `summary` | Yes | One-paragraph task description |
| `owners` | Yes | Maintainers responsible for review and updates |
| `entrypoint` | Yes | Path to `SKILL.md` |
| `tools` | Yes | Tool IDs this skill expects to use |
| `knowledge_refs` | No | Optional references to docs, schemas, or shared knowledge |
| `policies` | No | Safety or compliance policies that apply |
| `status` | Yes | `draft`, `active`, `deprecated`, or `archived` |

The registry may be implemented first as filesystem metadata such as `_meta.json`, and later as a database-backed registry.

## 3. Skill Registry

OpenClaw 应该把已安装的 skill 当作 registry entry 管理，而不是一堆随机 Markdown 文件。一个 registry entry 应该包含：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | 稳定的 skill 标识，例如 `icloud-mail` |
| `name` | 是 | 给人看的 skill 名称 |
| `version` | 是 | Skill 内容版本，独立于 tool 实现版本 |
| `summary` | 是 | 一段话说明这个 skill 解决什么任务 |
| `owners` | 是 | 负责评审和维护的人 |
| `entrypoint` | 是 | `SKILL.md` 路径 |
| `tools` | 是 | 该 skill 预期使用的 tool ID |
| `knowledge_refs` | 否 | 可选的文档、schema、shared knowledge 引用 |
| `policies` | 否 | 适用的安全或合规规则 |
| `status` | 是 | `draft`、`active`、`deprecated` 或 `archived` |

Registry 初期可以用 `_meta.json` 等文件元数据实现，后续再升级为数据库管理。

---

## 4. Recommended Directory Layout

```text
skills/
  icloud-mail/
    SKILL.md
    _meta.json
    examples/
      classify-receipt.md
      save-payment.md
    tests/
      fixtures/
      expected-decisions.md
```

Minimum viable skill package:

- `SKILL.md`: the task playbook.
- `_meta.json`: registry metadata.

Optional additions:

- `examples/`: realistic examples and counterexamples.
- `tests/`: scenario fixtures and expected decisions.
- `assets/`: prompt snippets, schemas, or static templates used by the skill.

## 4. 推荐目录结构

```text
skills/
  icloud-mail/
    SKILL.md
    _meta.json
    examples/
      classify-receipt.md
      save-payment.md
    tests/
      fixtures/
      expected-decisions.md
```

最小可用 skill package：

- `SKILL.md`：任务手册。
- `_meta.json`：registry 元数据。

可选扩展：

- `examples/`：真实风格的正例和反例。
- `tests/`：场景 fixture 和预期决策。
- `assets/`：skill 使用的 prompt 片段、schema 或静态模板。

---

## 5. `SKILL.md` Structure

A good `SKILL.md` should be written as an operator playbook, not an API catalog.

Recommended sections:

1. `Purpose`: what task this skill handles.
2. `When to Use`: trigger conditions and user intents.
3. `When Not to Use`: boundaries and handoff conditions.
4. `Available Tools`: short summary of relevant tools, not full API docs.
5. `Workflow`: step-by-step process for normal cases.
6. `Decision Rules`: classification, prioritization, and routing logic.
7. `Safety Rules`: privacy, confirmation, destructive action, and external side-effect rules.
8. `Failure Handling`: what to do when data is missing, ambiguous, or inconsistent.
9. `Examples`: realistic examples with expected agent behavior.
10. `Maintenance Notes`: versioning, known gaps, and owner notes.

Avoid:

- Copying a raw tool list without explaining task flow.
- Hiding safety rules inside examples only.
- Assuming the agent will infer the right tool order from function names.
- Mixing product knowledge, private memory, and mandatory policy without labels.

## 5. `SKILL.md` 结构

好的 `SKILL.md` 应该像操作手册，而不是 API 清单。

推荐章节：

1. `Purpose`：这个 skill 处理什么任务。
2. `When to Use`：什么用户意图或场景会触发它。
3. `When Not to Use`：边界条件和移交条件。
4. `Available Tools`：简要说明相关工具，不重复完整 API 文档。
5. `Workflow`：正常场景下的步骤。
6. `Decision Rules`：分类、优先级、路由规则。
7. `Safety Rules`：隐私、确认、破坏性操作、外部副作用规则。
8. `Failure Handling`：数据缺失、含糊或冲突时如何处理。
9. `Examples`：真实风格示例和期望 agent 行为。
10. `Maintenance Notes`：版本、已知缺口、维护者备注。

避免：

- 只复制 tool 列表，不解释任务流程。
- 只在示例里暗含安全规则。
- 假设 agent 能仅凭函数名推断正确调用顺序。
- 把产品知识、私人记忆、强制 policy 混在一起不标注。

---

## 6. Lifecycle

### 6.1 Draft

A skill starts as `draft` when the workflow is still exploratory. Draft skills may be incomplete, but they must clearly state known gaps.

### 6.2 Active

A skill becomes `active` after review. Active skills must have owners, a clear task boundary, safety rules, and at least one realistic example.

### 6.3 Deprecated

A skill becomes `deprecated` when a better skill replaces it or the underlying tools are changing. Deprecated skills should point to the replacement.

### 6.4 Archived

A skill becomes `archived` when it should no longer be loaded by agents.

## 6. 生命周期

### 6.1 Draft

当 workflow 还在探索阶段时，skill 状态为 `draft`。Draft skill 可以不完整，但必须写清楚已知缺口。

### 6.2 Active

评审通过后，skill 状态变为 `active`。Active skill 必须有 owner、清晰任务边界、安全规则，以及至少一个真实风格示例。

### 6.3 Deprecated

当已有更好的 skill 替代，或底层 tool 正在变化时，skill 状态变为 `deprecated`。Deprecated skill 应指向替代方案。

### 6.4 Archived

当 skill 不应再被 agent 加载时，状态变为 `archived`。

---

## 7. Versioning Rules

Skill versions should track behavior changes in the playbook.

- Patch: wording, examples, clarifications, typo fixes.
- Minor: new workflow branch, new decision rule, new supported task.
- Major: changed safety boundary, changed confirmation behavior, changed tool orchestration contract.

Tool versions and skill versions should be independent. A tool can change implementation without changing the skill if the task contract remains the same.

## 7. 版本规则

Skill 版本应该跟踪操作手册的行为变化。

- Patch：文字、示例、解释、错别字修正。
- Minor：新增 workflow 分支、新决策规则、新支持任务。
- Major：安全边界变化、确认行为变化、tool 编排契约变化。

Tool 版本和 skill 版本应该独立。只要任务契约不变，tool 的内部实现变化不一定要求 skill 改版。

---

## 8. Review Checklist

Before a skill is marked `active`, reviewers should check:

- The task boundary is clear.
- The skill explains when not to use it.
- The workflow is actionable without guessing hidden steps.
- Safety rules are explicit and near the top-level playbook, not buried in examples.
- Tool usage is explained by task intent.
- Ambiguous or missing input paths are covered.
- Examples include realistic language and at least one edge case.
- The skill avoids storing secrets, private user data, or generated local artifacts in Git.

## 8. 评审清单

在 skill 标记为 `active` 之前，reviewer 应检查：

- 任务边界清楚。
- 写明了什么时候不应该使用该 skill。
- Workflow 足够可执行，不需要猜隐藏步骤。
- 安全规则明确，并位于主手册层级，而不是埋在示例里。
- Tool 使用方式是由任务意图驱动的。
- 覆盖输入缺失、含糊或冲突的处理方式。
- 示例语言真实，并至少包含一个边界情况。
- 不把 secret、私人数据或本地生成产物提交到 Git。

---

## 9. Example: `icloud-mail`

The `icloud-mail` skill should not merely list mail tools. It should describe tasks such as:

- Classify unprocessed emails.
- Detect receipts, invoices, subscriptions, and refund notices.
- Decide when to save a payment transaction.
- Avoid duplicate transaction records.
- Ask for confirmation before uncertain financial writes.
- Keep private email content out of Git and public logs.

Example decision rule:

> If an email contains a clear merchant, amount, currency, and date, and it is not already linked to an existing transaction, the agent may call the transaction save tool. If any required field is uncertain, ask the user before writing.

## 9. 示例：`icloud-mail`

`icloud-mail` skill 不应该只是列出邮件工具。它应该描述具体任务，例如：

- 分类未处理邮件。
- 识别收据、发票、订阅、退款通知。
- 判断何时保存 payment transaction。
- 避免重复记录交易。
- 对不确定的财务写入先请求确认。
- 避免把私人邮件内容写入 Git 或公开日志。

示例决策规则：

> 如果邮件里有清晰的商户、金额、货币和日期，并且没有关联到已有交易，agent 可以调用交易保存工具。如果任何必填字段不确定，写入前必须询问用户。

---

## 10. Future Work

Future versions may add:

- A database-backed Skill Registry.
- Skill search and ranking by task intent.
- Runtime telemetry for which skills are selected and whether they succeed.
- Skill tests that replay user/task scenarios against expected decisions.
- Integration with LCM-PG `shared_knowledge` for workspace-level skill notes.
- A unified Agent Asset Layer for skills, tools, knowledge, memory, policy, and examples.

## 10. 后续方向

后续版本可以加入：

- 数据库支持的 Skill Registry。
- 按任务意图搜索和排序 skill。
- 记录运行时选择了哪些 skill、是否成功。
- 用用户/task 场景回放来测试 skill 决策。
- 与 LCM-PG `shared_knowledge` 集成，保存 workspace 级 skill notes。
- 统一的 Agent Asset Layer，用同一层管理 skills、tools、knowledge、memory、policy 和 examples。
