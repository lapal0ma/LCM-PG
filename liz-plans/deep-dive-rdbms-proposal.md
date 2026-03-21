# OpenViking Deep Dive & RDBMS-First Context Engine Proposal

## 1. Project Overview

**OpenViking** is an agent-native context database built on **AGFS** (Agent File System). AGFS provides a Plan 9-inspired unified filesystem abstraction — different backends (S3, Redis, SQL, queues) exposed through POSIX-like file operations.

Full Go source at `third_party/agfs/agfs-server/` (not compiled binary). Key components:
- `agfs-server/` — Go server with pluggable `ServicePlugin` interface
- `agfs-sdk/python/` — `pyagfs` Python SDK
- `agfs-fuse/` — FUSE mount
- `agfs-mcp/` — MCP integration

## 2. The Architectural Smell

Current design is circular:

```
DB backends → AGFS (strip ACID, expose files) → OpenViking (bolt ACID back on with file locks)
```

AGFS hides DB guarantees behind a file API. Then OpenViking tries to recover those guarantees using file locks — which are fragile, don't survive crashes, don't compose, and don't give rollback.

### The Lock System (v0.2.8)

OpenViking replaced its old transaction manager with a new lock-based system:

- **PathLock** (`path_lock.py`): File-based distributed locking using `.path.ovlock` files. Two modes — POINT (single dir) and SUBTREE (recursive, scans all descendants).
- **LockManager** (`lock_manager.py`): Singleton managing lifecycle + stale cleanup every 60s.
- **RedoLog** (`redo_log.py`): Write-ahead marker files for crash recovery. Write before op, delete after success.

#### Lock acquisition protocol (POINT mode):
```
loop until timeout (poll 200ms):
  1. stat(path)                              ← AGFS call
  2. read(.path.ovlock)                      ← AGFS call
  3. Walk ancestors, read each .ovlock       ← N AGFS calls
  4. write(.path.ovlock, fencing_token)      ← AGFS call
  5. TOCTOU re-check ancestors               ← N AGFS calls
  6. read(.ovlock) verify ownership          ← AGFS call
```

SUBTREE mode adds recursive `ls()` + `read()` on ALL descendants — O(tree_size) network calls.

#### Problems:
1. **Race conditions mitigated, not eliminated.** TOCTOU double-check with "later timestamp backs off" is clever but best-effort heuristic.
2. **Lock expiry is a time bomb.** Default 300s — if VLM call takes >5min, lock expires silently. Refresh loop helps but can fail.
3. **No atomicity.** `session.commit` Phase 1 runs without lock because "LLM calls have unpredictable latency."
4. **Redo log stored in AGFS.** If AGFS is what failed, recovery markers are also gone.
5. **Massive I/O overhead.** Every lock acquire/release = multiple AGFS round trips through Python → HTTP → Go → syscall.

## 3. Vector Index: Custom C++ Brute-Force Engine

No external vector DB (not LanceDB, FAISS, or HNSWLIB). Custom C++ engine via pybind11:

- `src/index/` — C++ implementation (brute-force KNN, int8 quantization, sparse vectors)
- `openviking/storage/vectordb/engine/` — compiled `.so`/`.dylib`, auto-selects CPU variant (SSE3, AVX2, AVX512)
- `openviking/storage/vectordb/index/local_index.py` — Python wrapper

**It's flat brute-force, not ANN.** Linear scan through all vectors. Works for small collections but won't scale to millions of vectors.

## 4. Document Insert Trace (add_resource)

Every AGFS call maps 1:1 to a basic OS syscall through the `localfs` plugin:

| AGFS call | Go plugin | Actual syscall |
|---|---|---|
| `agfs.mkdir()` | `localfs.Mkdir()` | `os.MkdirAll()` |
| `agfs.write()` | `localfs.Write()` | `os.WriteFile()` |
| `agfs.read()` | `localfs.Read()` | `os.ReadFile()` |
| `agfs.mv()` | `localfs.Rename()` | `os.Rename()` |
| `agfs.rm()` | `localfs.RemoveAll()` | `os.RemoveAll()` |

Insert flow:
```
add_resource("./doc.pdf")
  ├─ [SYNC] Parse: agfs.mkdir(temp), agfs.write(temp/files)
  ├─ [ASYNC] Semantic queue:
  │   ├─ VLM generates L0/L1 summaries
  │   ├─ agfs.write(.abstract.md), agfs.write(.overview.md)
  │   ├─ agfs.mkdir(/resources/), agfs.rm(target if exists)
  │   └─ agfs.mv(temp → /resources/doc)  ← the critical move
  └─ [ASYNC] Embedding queue:
      ├─ agfs.read(file content)
      ├─ embedder.embed(text)
      └─ vector_store.upsert(vector)
```

## 5. OpenClaw Context Engine Interface

OpenClaw 2026.3.7 introduced pluggable ContextEngine slots. The full lifecycle:

```
Agent Turn Lifecycle:

  ┌─ bootstrap()                ← engine starts up
  ├─ assemble(messages, budget) ← BEFORE each LLM call
  │   "What context should the LLM see?"
  │   Returns: messages + systemPromptAddition + estimatedTokens
  ├─ [LLM generates response]
  ├─ ingest(message)            ← AFTER each message
  │   "Store this message"
  ├─ afterTurn(messages, ...)   ← AFTER the full turn completes
  │   "Extract insights, update memories"
  ├─ compact(session, budget)   ← WHEN context exceeds token budget
  │   "Compress old context to fit budget"
  ├─ prepareSubagentSpawn()     ← BEFORE spawning sub-agent
  ├─ onSubagentEnded()          ← AFTER sub-agent completes
  └─ shutdown()
```

### What OpenViking Actually Implements

| Hook | OpenViking now | What it should do |
|---|---|---|
| `assemble` | Passthrough (no-op!) | Query DB for relevant memories + resources, inject into prompt |
| `ingest` | No-op (defers to afterTurn) | `INSERT INTO messages` — one row |
| `afterTurn` | All the work — temp session dance | `INSERT INTO memories` from LLM extraction |
| `compact` | Delegates to legacy OpenClaw | `BEGIN; archive; DELETE; COMMIT;` |
| `prepareSubagentSpawn` | Not implemented | Share context rows with sub-agent |
| `onSubagentEnded` | Not implemented | Merge sub-agent discoveries back |

### OpenViking's afterTurn Trace (31 AGFS round trips)

```
afterTurn() calls 4 HTTP endpoints sequentially:

1. createSession()        → agfs.mkdir + agfs.write           = 2 calls
2. addSessionMessage()    → agfs.read + agfs.ls + agfs.read
                            + agfs.write (full rewrite!)      = 4 calls
3. extractMemories()      → agfs.stat + agfs.read + agfs.ls
                            + N × (mkdir + write × 3)         = ~15 calls
4. deleteSession()        → agfs.stat + lock ops + agfs.rm   = ~4 calls
                            + lock overhead                    = ~6 calls
                                                        Total ≈ 31 round trips
```

Note: "append" to messages.jsonl is implemented as read-all + write-all. No actual append.
The throwaway session pattern (create → use → delete) exists only because OpenViking's model requires a filesystem directory before you can write to it.

## 6. First-Principles Proposal: RDBMS-First Context Engine

### The Core Argument

AGFS's multi-backend flexibility (S3, Redis, SQL behind one interface) is generality you're paying for but not benefiting from. Most deployments use local storage + vector search. An RDBMS gives you ACID, versioning, vector search, and full-text search in one package.

```
Current:   DB backends → AGFS (strip ACID) → OpenViking (bolt ACID back on)
Proposed:  RDBMS (ACID native) → Virtual FS layer → Agent sees same interface
```

### Local FS vs S3: Not an Architecture Decision

Both are just blob stores with path-based addressing. Neither gives transactions, versioning, or relational integrity. PostgreSQL handles blob storage transparently via TOAST (auto-chunked side table, up to 1GB per value).

### Comparison: File Locks vs RDBMS

| Concern | Current (file locks on AGFS) | RDBMS |
|---|---|---|
| Mutual exclusion | Best-effort TOCTOU + fencing tokens | `SELECT ... FOR UPDATE` — kernel-guaranteed |
| Atomicity | None (ordered operations + hope) | `BEGIN/COMMIT` — all-or-nothing |
| Crash recovery | Custom redo log in AGFS files | WAL — built into the engine |
| Lock granularity | POINT/SUBTREE (recursive scan) | Row-level locks, automatic |
| Lock acquisition cost | O(tree_depth + tree_size) network calls | Single SQL statement |
| Deadlock detection | None (timeout-based) | Built-in deadlock detector |

### SQLite vs PostgreSQL

| | SQLite | PostgreSQL |
|---|---|---|
| Deployment | Single file, zero ops | Separate server process |
| Concurrency | Single writer (WAL helps reads) | Full MVCC, many writers |
| Vector search | sqlite-vec extension | pgvector (mature, HNSW) |
| Full-text search | FTS5 (built-in) | tsvector (built-in, richer) |
| Embedded use | Perfect | Not possible |
| Team/multi-tenant | Awkward | Native |

**Recommendation:** Start with SQLite (matches OpenViking's local-first use case), design abstraction so PostgreSQL is a drop-in swap for team/remote mode.

### SQLite Context Engine Implementation

```python
class SQLiteContextEngine:

    def assemble(self, session_id, messages, token_budget):
        """Called before every LLM call. THE most important method."""
        # Semantic search (sqlite-vec) + FTS5 keyword search
        # Recency boost + budget-aware truncation
        # Return: messages + system prompt with injected context

    def ingest(self, session_id, message):
        """Called per message. Just store it."""
        # INSERT INTO messages (...) VALUES (...)

    def afterTurn(self, session_id, messages):
        """Called after turn. Extract durable memories."""
        # LLM extracts candidates → deduplicate → BEGIN; INSERT; COMMIT;

    def compact(self, session_id, token_budget):
        """Called when context too large."""
        # BEGIN;
        #   INSERT INTO archives SELECT ... FROM messages WHERE turn < cutoff;
        #   DELETE FROM messages WHERE turn < cutoff;
        #   UPDATE sessions SET summary = $llm_summary;
        # COMMIT;
```

Every hook = 1-3 SQL statements inside a transaction. No temp sessions, no file locks, no redo logs, no 31 AGFS round trips.

### The session.commit Example

OpenViking's current approach (500+ lines of lock/redo code):
```
Phase 1 (no lock): LLM summary → write archive → clear messages → clear in-memory
Phase 2 (redo log): write marker → extract memories → write state → enqueue → delete marker
Crash recovery: scan markers on startup, replay
```

RDBMS approach:
```sql
BEGIN;
  INSERT INTO archives (session_id, messages, summary) VALUES (...);
  DELETE FROM messages WHERE session_id = ?;
  INSERT INTO memories (content, source_archive) VALUES (...);
COMMIT;
-- Crash at ANY point = full rollback. No redo log needed.
```

## 7. PageIndex: Vectorless Retrieval

**PageIndex** (by VectifyAI) replaces vector similarity with LLM reasoning over a tree-structured document index. OpenViking's existing L0/L1/L2 hierarchy is a natural fit.

Integration path:
1. Add `PageIndexRetriever` alongside existing `HierarchicalRetriever`
2. Reuse L0 abstracts as tree node summaries (already generated)
3. Add retriever mode: VECTOR / REASONING / HYBRID

See `pageindex-agfs-analysis.md` for full details.

## 8. OpenClaw Plugin: memory-plugin → context-engine

PR #662 renamed `openclaw-memory-plugin` to `openclaw-plugin`, reflecting the upgrade from memory-only to full context engine:

- Old: memory store/recall hooks
- New: implements OpenClaw's `ContextEngine` protocol (ingest, assemble, compact, afterTurn)
- Supports semantic + keyword capture modes
- Multi-tenant with account/user/agent isolation
- Local mode (embedded) and remote mode (HTTP)

Key PRs:
- **#662** — `feat(openclaw-plugin 2.0): from memory plugin to context engine`
- **#431** — `feat(storage): add path locking and selective crash recovery`
- **#709** — `feat(resources): add resource watch scheduling`

## 9. Signs They're Already Moving Toward RDBMS

- `sqlite_backend.go` added to queuefs — file-based queues weren't reliable enough
- RedoLog is essentially a hand-rolled WAL
- PathLock protocol is a hand-rolled `SELECT FOR UPDATE`
- They're rebuilding database primitives one at a time on top of a filesystem

## 10. References

- [VectifyAI/PageIndex on GitHub](https://github.com/VectifyAI/PageIndex)
- [OpenClaw ContextEngine Architecture](https://epsilla.com/blogs/2026-03-09-openclaw-2026-3-7-contextengine-agentic-architecture)
- [Using SQLite for AI Agent Memory with OpenClaw](https://www.pingcap.com/blog/local-first-rag-using-sqlite-ai-agent-memory-openclaw/)
- [PageIndex: Vectorless, Reasoning-based RAG](https://pageindex.ai/blog/pageindex-intro)
- [I Rewrote a Python RAG Library in Rust](https://sia.hackernoon.com/i-rewrote-a-python-rag-library-in-rust)

