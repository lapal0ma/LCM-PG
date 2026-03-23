---
"@lapal0ma/lcm-pg": patch
---

Improve M4 operational defaults and documentation:

- raise default `LCM_ASSEMBLE_SK_TIMEOUT_MS` from `500` to `2000`
- document mirror-only mode (`LCM_SHARED_KNOWLEDGE_ENABLED=false`) and mirror-search admin semantics
- clarify `lcm_mirror_search` authorization messages when shared knowledge is disabled
