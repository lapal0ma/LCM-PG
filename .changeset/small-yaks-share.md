---
"@lapal0ma/lcm-pg": minor
---

Add M4 PostgreSQL read-path capabilities for shared cross-agent knowledge:

- Add new tools:
  - `lcm_manage_roles` (admin-only role-group assignment management)
  - `lcm_mirror_search` (admin-only mirror keyword search)
  - `lcm_shared_knowledge_write` (admin-only shared knowledge curation)
  - `lcm_shared_knowledge_search` (RLS-filtered shared knowledge search for all agents)
- Add `pg-reader` shared layer with:
  - idempotent `knowledge_roles` / `shared_knowledge` DDL
  - role-based RLS policies
  - transaction-local `set_config('app.agent_id', ...)` session scoping
- Add optional assemble-time shared knowledge injection with strict limits/timeouts and graceful fallback on PG failures.
- Add feature flags and defaults for shared knowledge and assemble injection, including bootstrap role seeding (`main -> admin`, `research -> researcher`, `email -> personal-ops`).
