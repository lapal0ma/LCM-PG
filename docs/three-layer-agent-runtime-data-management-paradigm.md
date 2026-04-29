# Three-layer Agent Runtime Data Management Paradigm / 三层 Agent 运行时数据管理范式

Status: Draft
Audience: Agent runtime developers, context-engine authors, tool/plugin authors, data platform designers
Scope: A conceptual and implementation-oriented SPEC for modeling data produced, retrieved, validated, and consumed by AI agents at runtime.

---

## 1. Executive Summary

Agent runtime data should not be modeled as plain chat history or generic logs only. It starts as logs, but its long-term value comes from preserving context construction, evidence chains, decisions, actions, and knowledge promotion.

This SPEC proposes a three-layer paradigm:

1. Raw Trace Layer: preserve the ground truth of model requests, responses, tool definitions, tool outputs, token usage, and context window snapshots.
2. Interaction Event Layer: normalize raw traces into queryable runtime events such as tool calls, search results, file reads, validations, approvals, and context compactions.
3. Agent Knowledge and Decision Layer: model claims, evidence, assumptions, decisions, actions, artifacts, validations, and candidates for memory, knowledge, skill, or policy.

The key difference from traditional log management or NoSQL document storage is that agent data has cognitive roles. The system must track not only what happened, but also how information entered the model context, what it supported, what action followed, and whether it should become reusable knowledge.

## 1. 摘要

Agent 运行时数据不应该只被建模成普通聊天记录或通用日志。它首先当然是 log，但它的长期价值来自于保存 context 构造过程、证据链、决策、行动以及知识沉淀路径。

本 SPEC 提出一个三层范式：

1. Raw Trace Layer：保留模型请求、响应、tool definitions、tool outputs、token usage、context window snapshot 等原始事实。
2. Interaction Event Layer：把 raw trace 规范化为可查询的运行时事件，例如 tool call、search result、file read、validation、approval、context compaction。
3. Agent Knowledge and Decision Layer：建模 claim、evidence、assumption、decision、action、artifact、validation，以及可升级为 memory、knowledge、skill、policy 的候选内容。

它和传统 log management 或 NoSQL document storage 的核心区别在于：agent 数据具有认知角色。系统不只要记录发生了什么，还要记录信息如何进入模型上下文、支撑了什么判断、导致了什么行动，以及是否应该沉淀成可复用知识。

---

## 2. Motivation

Tools such as `claude-trace` show why raw agent traces matter. They expose data that is usually hidden behind an agent interface:

- System prompts and developer instructions.
- Tool definitions available to the model.
- Raw tool outputs from file reads, searches, API calls, and shell commands.
- Raw model request and response payloads.
- Thinking or intermediate reasoning blocks when available.
- Token usage and cache behavior.
- The actual context window sent to the model.

For debugging, this is already valuable. For agent runtime data management, it is more important: these traces are the raw material for understanding, auditing, improving, and reusing agent work.

## 2. 动机

`claude-trace` 这类工具说明了为什么原始 agent trace 很重要。它暴露了 agent interface 后面通常看不见的数据：

- System prompt 和 developer instruction。
- 模型可用的 tool definitions。
- 文件读取、搜索、API 调用、shell 命令等 tool outputs。
- 原始 model request 和 response payload。
- 可用时的 thinking 或中间推理块。
- Token usage 和 cache 行为。
- 真实发送给模型的 context window。

对 debugging 来说，这已经很有价值。对 agent runtime data management 来说，它更重要：这些 trace 是理解、审计、改进和复用 agent 工作的原始材料。

---

## 3. Why Generic Logs Are Not Enough

A traditional log answers: an event happened at a time in a system.

An agent trace must answer more questions:

- What information was available to the model at the moment of a decision?
- Which retrieved item was selected into the context window, and which item was dropped?
- Which tool output supported a claim?
- Which assumption was unverified but used anyway?
- Which action had external side effects?
- Which user approval authorized the action?
- Which repeated workflow should become a skill?
- Which observation should become project memory or shared knowledge?

Therefore, agent data is not only event data. It is event data plus context, provenance, evidence, decision, action, and promotion semantics.

## 3. 为什么普通日志不够

传统日志回答的是：某个系统在某个时间发生了某个事件。

Agent trace 还必须回答更多问题：

- 做出某个决策时，模型到底看到了哪些信息？
- 哪些检索结果被放进 context window，哪些被丢弃？
- 哪个 tool output 支撑了某个 claim？
- 哪个 assumption 没有验证但被临时采用了？
- 哪个 action 产生了外部副作用？
- 哪次用户确认授权了这个 action？
- 哪个重复 workflow 应该升级为 skill？
- 哪个 observation 应该升级为 project memory 或 shared knowledge？

因此，agent 数据不只是 event data。它是 event data 加上 context、provenance、evidence、decision、action 和 promotion semantics。

---

## 4. Design Principles

### 4.1 Preserve Raw Ground Truth

The system should keep the raw request and response stream before interpretation. Derived models may change, but raw traces are the audit base.

### 4.2 Model Context as a First-class Object

The actual context window sent to the model should be stored as a structured object, not reconstructed later from chat history.

### 4.3 Separate Events from Decisions

A tool call is an event. A conclusion based on that tool call is a claim. A selected next step is a decision. These should be linked but not collapsed into one blob.

### 4.4 Track Provenance

Every important claim, action, artifact, memory, or skill candidate should link back to its supporting trace events and context items.

### 4.5 Support Promotion

Runtime data may move through lifecycle stages, for example: trace event to observation, observation to knowledge candidate, knowledge candidate to shared knowledge.

### 4.6 Treat Side Effects Explicitly

Reading a file, writing a file, creating an issue, sending an email, and writing a database row have different risk levels. The model should store side-effect level and authorization state.

## 4. 设计原则

### 4.1 保留原始事实

系统应该在解释之前保存原始 request 和 response stream。派生模型可以变化，但 raw trace 是审计基础。

### 4.2 把 Context 当作一等对象

真实发送给模型的 context window 应该作为结构化对象保存，而不是事后从聊天记录里推测重建。

### 4.3 区分 Event 和 Decision

Tool call 是事件。基于 tool call 得出的结论是 claim。选择下一步是 decision。它们应该互相关联，但不应该被压成同一个 blob。

### 4.4 追踪 Provenance

每个重要 claim、action、artifact、memory 或 skill candidate 都应该能追溯到支撑它的 trace events 和 context items。

### 4.5 支持 Promotion

运行时数据会经历生命周期跃迁，例如：trace event 到 observation，observation 到 knowledge candidate，knowledge candidate 到 shared knowledge。

### 4.6 显式建模 Side Effect

读文件、写文件、创建 issue、发送邮件、写数据库行的风险等级不同。模型应该记录 side-effect level 和 authorization state。

---

## 5. Layer 1: Raw Trace Layer

The Raw Trace Layer is an append-only record of what actually crossed the agent and model boundary.

Typical records:

- Raw HTTP request and response pairs.
- Model request payloads.
- Model response payloads.
- Streaming chunks or SSE events.
- System prompts and developer messages.
- Tool definitions and schemas.
- Tool outputs as seen by the model.
- Token counts, cache hits, model name, and request metadata.

Primary goal: debugging, replay, audit, and future reprocessing.

This layer should minimize interpretation. It should allow later processors to rebuild higher-level events even if the event schema changes.

## 5. 第一层：Raw Trace Layer

Raw Trace Layer 是 append-only 的原始记录，保存 agent 和 model 边界上真实传递过的内容。

典型记录包括：

- 原始 HTTP request 和 response pair。
- Model request payload。
- Model response payload。
- Streaming chunk 或 SSE event。
- System prompt 和 developer message。
- Tool definition 和 schema。
- 模型看到的 tool output。
- Token count、cache hit、model name 和 request metadata。

主要目标：debugging、replay、audit 和未来重新处理。

这一层应该尽量减少解释。即使未来 event schema 改变，也应该能从 raw trace 重新构建更高层事件。

---

## 6. Layer 2: Interaction Event Layer

The Interaction Event Layer normalizes raw traces into queryable runtime events.

Suggested event types:

| Event Type | Meaning |
|---|---|
| `user_message` | User input received by the agent |
| `assistant_message` | Agent output shown to the user |
| `llm_request` | Model invocation started |
| `llm_response` | Model invocation completed |
| `tool_call` | Agent/model requested a tool call |
| `tool_result` | Tool returned data or error |
| `file_read` | Agent read a file or code block |
| `file_write` | Agent created or modified an artifact |
| `search_query` | Agent searched code, docs, web, or memory |
| `search_result_selected` | Agent selected a retrieved item for use |
| `validation_passed` | A check, test, or review passed |
| `validation_failed` | A check, test, or review failed |
| `user_approval` | User approved a proposed action |
| `user_rejection` | User rejected or corrected an action |
| `context_compacted` | Context was summarized or compressed |

Primary goal: operational queryability.

Examples of useful questions:

- Which tools were called during this task?
- Which file writes happened after user approval?
- Which validation failed before the final fix?
- Which search results were retrieved but not selected?
- How many model calls were needed to complete this task?

## 6. 第二层：Interaction Event Layer

Interaction Event Layer 把 raw trace 规范化成可查询的运行时事件。

建议事件类型：

| Event Type | 含义 |
|---|---|
| `user_message` | Agent 收到的用户输入 |
| `assistant_message` | Agent 展示给用户的输出 |
| `llm_request` | 一次模型调用开始 |
| `llm_response` | 一次模型调用完成 |
| `tool_call` | Agent/model 请求调用工具 |
| `tool_result` | 工具返回数据或错误 |
| `file_read` | Agent 读取文件或代码块 |
| `file_write` | Agent 创建或修改 artifact |
| `search_query` | Agent 搜索代码、文档、网页或 memory |
| `search_result_selected` | Agent 选择某个检索结果进入使用链路 |
| `validation_passed` | 某个检查、测试或 review 通过 |
| `validation_failed` | 某个检查、测试或 review 失败 |
| `user_approval` | 用户批准某个拟执行动作 |
| `user_rejection` | 用户拒绝或纠正某个动作 |
| `context_compacted` | Context 被总结或压缩 |

主要目标：运行过程可查询。

典型问题：

- 这个任务调用过哪些工具？
- 哪些文件写入发生在用户确认之后？
- 最终修复前哪次 validation 失败了？
- 哪些搜索结果被检索出来但没有被选用？
- 完成这个任务用了多少次 model call？

---

## 7. Layer 3: Agent Knowledge and Decision Layer

The Agent Knowledge and Decision Layer models the cognitive role of runtime data.

Suggested entities:

| Entity | Meaning |
|---|---|
| `claim` | A statement the agent believes may be true |
| `evidence` | Source data supporting or contradicting a claim |
| `assumption` | A claim used before full validation |
| `decision` | A selected path among alternatives |
| `action` | An operation performed by the agent |
| `artifact` | Output produced by the agent, such as code, docs, SQL, PR, issue, or report |
| `validation` | Test, check, review, or user confirmation result |
| `memory_candidate` | Runtime observation that may become durable memory |
| `knowledge_candidate` | Runtime observation that may become shared knowledge |
| `skill_candidate` | Repeated workflow that may become a `SKILL.md` playbook |
| `policy_candidate` | Repeated safety rule that may become mandatory policy |

Primary goal: explainability, reuse, governance, and learning.

This layer makes it possible to answer:

- Why did the agent make this decision?
- What evidence supports this generated artifact?
- Which assumptions were never validated?
- Which runtime observations should be promoted into knowledge?
- Which repeated workflow should become a skill?

## 7. 第三层：Agent Knowledge and Decision Layer

Agent Knowledge and Decision Layer 建模运行时数据的认知角色。

建议实体：

| Entity | 含义 |
|---|---|
| `claim` | Agent 认为可能为真的陈述 |
| `evidence` | 支撑或反驳 claim 的来源数据 |
| `assumption` | 未完全验证但临时采用的 claim |
| `decision` | 在多个候选路径中选择的路线 |
| `action` | Agent 实际执行的操作 |
| `artifact` | Agent 产出的结果，例如代码、文档、SQL、PR、issue、报告 |
| `validation` | 测试、检查、review 或用户确认结果 |
| `memory_candidate` | 可能升级为 durable memory 的运行时观察 |
| `knowledge_candidate` | 可能升级为 shared knowledge 的运行时观察 |
| `skill_candidate` | 可能升级为 `SKILL.md` playbook 的重复 workflow |
| `policy_candidate` | 可能升级为 mandatory policy 的重复安全规则 |

主要目标：可解释、可复用、可治理、可学习。

这一层可以回答：

- Agent 为什么做出这个决定？
- 哪些证据支撑这个 artifact？
- 哪些 assumption 从未验证？
- 哪些运行时 observation 应该升级为 knowledge？
- 哪些重复 workflow 应该沉淀成 skill？

---

## 8. Conceptual Data Model

A minimal relational model may look like this:

```text
agent_sessions
  session_id
  workspace_id
  user_id
  agent_id
  started_at
  ended_at
  task_summary

raw_trace_records
  trace_id
  session_id
  ts
  transport
  direction
  endpoint
  raw_json
  raw_text

llm_calls
  llm_call_id
  session_id
  request_trace_id
  response_trace_id
  model
  input_tokens
  output_tokens
  cache_read_tokens
  status

context_snapshots
  snapshot_id
  llm_call_id
  model
  total_tokens
  messages_json
  selection_policy

context_items
  context_item_id
  snapshot_id
  source_type
  source_ref
  role_in_context
  content
  token_count
  selected_reason

interaction_events
  event_id
  session_id
  parent_event_id
  event_type
  actor
  ts
  text
  payload_json
  status

agent_claims
  claim_id
  session_id
  claim_text
  confidence
  status

agent_decisions
  decision_id
  session_id
  decision_text
  alternatives_json
  selected_reason
  status

agent_actions
  action_id
  session_id
  action_type
  target_ref
  side_effect_level
  authorization_event_id
  status

artifacts
  artifact_id
  session_id
  artifact_type
  artifact_ref
  summary
  created_by_action_id

evidence_links
  link_id
  target_type
  target_id
  source_type
  source_id
  relation
  note

promotion_candidates
  candidate_id
  session_id
  candidate_type
  source_type
  source_id
  content
  proposed_destination
  status
```

This model intentionally separates raw records, normalized events, context items, claims, decisions, actions, artifacts, evidence links, and promotion candidates.

## 8. 概念数据模型

一个最小关系模型可以类似这样：

```text
agent_sessions
  session_id
  workspace_id
  user_id
  agent_id
  started_at
  ended_at
  task_summary

raw_trace_records
  trace_id
  session_id
  ts
  transport
  direction
  endpoint
  raw_json
  raw_text

llm_calls
  llm_call_id
  session_id
  request_trace_id
  response_trace_id
  model
  input_tokens
  output_tokens
  cache_read_tokens
  status

context_snapshots
  snapshot_id
  llm_call_id
  model
  total_tokens
  messages_json
  selection_policy

context_items
  context_item_id
  snapshot_id
  source_type
  source_ref
  role_in_context
  content
  token_count
  selected_reason

interaction_events
  event_id
  session_id
  parent_event_id
  event_type
  actor
  ts
  text
  payload_json
  status

agent_claims
  claim_id
  session_id
  claim_text
  confidence
  status

agent_decisions
  decision_id
  session_id
  decision_text
  alternatives_json
  selected_reason
  status

agent_actions
  action_id
  session_id
  action_type
  target_ref
  side_effect_level
  authorization_event_id
  status

artifacts
  artifact_id
  session_id
  artifact_type
  artifact_ref
  summary
  created_by_action_id

evidence_links
  link_id
  target_type
  target_id
  source_type
  source_id
  relation
  note

promotion_candidates
  candidate_id
  session_id
  candidate_type
  source_type
  source_id
  content
  proposed_destination
  status
```

这个模型刻意区分 raw record、normalized event、context item、claim、decision、action、artifact、evidence link 和 promotion candidate。

---

## 9. Difference from Traditional NoSQL

Traditional NoSQL systems are good at storing flexible documents, high-volume logs, and semi-structured records. Their primary question is often: how can we store, index, query, and aggregate flexible data?

Agent runtime data introduces a different question: what role did this data play in the agent's cognition and action loop?

The key differences are:

| Dimension | Traditional Log or NoSQL | Agent Runtime Data |
|---|---|---|
| Primary unit | Event or document | Context item, event, claim, decision, action, evidence |
| Main question | What happened? | What did the model know, infer, decide, and do? |
| Context | Often implicit | First-class, snapshot-based object |
| Provenance | Useful but optional | Mandatory for trust and debugging |
| Semantics | Application-defined fields | Cognitive roles and action semantics |
| Lifecycle | Store, query, expire | Store, query, validate, promote, govern |
| Search | Field filters and full-text | Field filters, full-text, semantic search, evidence traversal |
| Risk model | Security and retention | Security, retention, authorization, side effects, hallucination risk |

## 9. 和传统 NoSQL 的区别

传统 NoSQL 擅长存储灵活 document、大规模 log 和半结构化记录。它的核心问题通常是：如何存储、索引、查询和聚合灵活数据？

Agent runtime data 引入了另一个问题：这段数据在 agent 的认知和行动循环里扮演了什么角色？

核心区别是：

| 维度 | 传统 Log 或 NoSQL | Agent Runtime Data |
|---|---|---|
| 基本单元 | Event 或 document | Context item、event、claim、decision、action、evidence |
| 核心问题 | 发生了什么？ | 模型知道了什么、推断了什么、决定了什么、做了什么？ |
| Context | 通常隐含 | 一等对象，按 snapshot 保存 |
| Provenance | 有用但可选 | 对 trust 和 debugging 必需 |
| 语义 | 应用自定义字段 | 认知角色和行动语义 |
| 生命周期 | 存储、查询、过期 | 存储、查询、验证、升级、治理 |
| 搜索 | 字段过滤和全文搜索 | 字段过滤、全文搜索、语义搜索、证据链遍历 |
| 风险模型 | 安全和保留周期 | 安全、保留周期、授权、副作用、幻觉风险 |

---

## 10. Promotion Lifecycle

Agent runtime data should support promotion into durable assets.

Suggested lifecycle:

```text
raw trace
  -> interaction event
  -> observation
  -> candidate
  -> reviewed asset
```

Candidate destinations:

- Memory: stable user or project preference.
- Knowledge: reusable fact, explanation, schema, or decision note.
- Skill: reusable workflow or task playbook.
- Policy: mandatory rule or safety boundary.
- Test: scenario that should be replayed in the future.

Promotion should usually require review when the target asset affects future behavior.

## 10. Promotion 生命周期

Agent runtime data 应该支持升级为 durable assets。

建议生命周期：

```text
raw trace
  -> interaction event
  -> observation
  -> candidate
  -> reviewed asset
```

候选目标：

- Memory：稳定的用户或项目偏好。
- Knowledge：可复用事实、解释、schema 或 decision note。
- Skill：可复用 workflow 或 task playbook。
- Policy：强制规则或安全边界。
- Test：未来应该回放的场景。

当目标 asset 会影响未来行为时，promotion 通常应该经过 review。

---

## 11. Query Patterns

Important query patterns include:

- Reconstruct the exact context window for a model call.
- Find all evidence supporting a generated artifact.
- Find all actions with external side effects in a session.
- Find claims that were used but never validated.
- Find tool results that were retrieved but not selected into context.
- Find repeated workflows that should become skills.
- Find user corrections that should become memory or policy.
- Find sessions where validation failed after a similar decision.

These queries require both structured metadata and semantic retrieval. Embeddings are useful, but they are not enough. Evidence links and event structure are required for auditability.

## 11. 查询模式

重要查询模式包括：

- 重建某次 model call 的真实 context window。
- 找到支撑某个 artifact 的全部 evidence。
- 找到一个 session 中所有有外部副作用的 actions。
- 找到被使用但从未验证的 claims。
- 找到被检索出来但没有进入 context 的 tool results。
- 找到应该升级为 skill 的重复 workflows。
- 找到应该升级为 memory 或 policy 的用户纠正。
- 找到相似 decision 后 validation 失败的历史 sessions。

这些查询同时需要结构化 metadata 和语义检索。Embedding 有用，但不够。为了可审计，必须保留 evidence links 和 event structure。

---

## 12. Privacy and Governance

Agent runtime traces may contain sensitive data. The system should support:

- Local-only trace storage for private workspaces.
- Redaction before export or sharing.
- Retention policies by data class.
- Access control by workspace, user, agent, and asset type.
- Explicit marking of secrets and private documents.
- Separation between raw traces and promoted shared knowledge.
- User approval before promoting private observations into durable shared assets.

Generated local data, private traces, and raw tool outputs should not be committed to public Git repositories by default.

## 12. 隐私和治理

Agent runtime trace 可能包含敏感数据。系统应该支持：

- 私有 workspace 的 local-only trace storage。
- 导出或共享前 redaction。
- 按数据类别设置 retention policy。
- 按 workspace、user、agent、asset type 做 access control。
- 显式标记 secret 和 private document。
- 区分 raw trace 和 promoted shared knowledge。
- 把 private observation 升级为 durable shared asset 前需要用户确认。

默认情况下，本地生成数据、私人 trace 和原始 tool output 不应该提交到公开 Git 仓库。

---

## 13. Relationship to LCM-PG

LCM-PG already focuses on durable context, PostgreSQL mirroring, and shared knowledge. This SPEC extends the conceptual model from context persistence to runtime data management.

Possible future integrations:

- Store compacted context snapshots in PostgreSQL for audit and replay.
- Link `shared_knowledge` rows back to source trace events and evidence.
- Add a runtime event table for tool calls, searches, validations, and actions.
- Add promotion workflows from trace observations to shared knowledge.
- Use skill management to turn repeated successful workflows into `SKILL.md` playbooks.
- Use Metabase dashboards to inspect agent behavior, validation failure rates, and side-effect actions.

## 13. 和 LCM-PG 的关系

LCM-PG 已经关注 durable context、PostgreSQL mirror 和 shared knowledge。本 SPEC 把概念从 context persistence 扩展到 runtime data management。

可能的未来集成：

- 在 PostgreSQL 中保存 compacted context snapshots，用于 audit 和 replay。
- 让 `shared_knowledge` 行反向链接到 source trace events 和 evidence。
- 增加 runtime event table，保存 tool calls、searches、validations 和 actions。
- 增加从 trace observation 到 shared knowledge 的 promotion workflow。
- 用 skill management 把反复成功的 workflow 沉淀成 `SKILL.md` playbook。
- 用 Metabase dashboard 检查 agent 行为、validation failure rate 和 side-effect actions。

---

## 14. Open Questions

- What is the minimum trace data that must be stored to reconstruct a model call faithfully?
- Which raw traces should be stored locally only, and which can be mirrored to PostgreSQL?
- How should context item selection reasons be captured without over-instrumenting the agent?
- What review process should approve promotion from trace to memory, knowledge, skill, or policy?
- Should claims and decisions be explicitly extracted by the agent, or derived asynchronously by a post-processor?
- How should retention policies differ for raw traces, normalized events, and promoted assets?

## 14. 开放问题

- 为了忠实重建一次 model call，最少必须保存哪些 trace data？
- 哪些 raw trace 应该只保存在本地，哪些可以 mirror 到 PostgreSQL？
- 如何记录 context item selection reason，同时避免对 agent 做过度 instrumentation？
- 从 trace 升级到 memory、knowledge、skill 或 policy 应该由什么 review process 批准？
- Claim 和 decision 应该由 agent 显式抽取，还是由异步 post-processor 推导？
- Raw trace、normalized event 和 promoted asset 应该采用怎样不同的 retention policy？
