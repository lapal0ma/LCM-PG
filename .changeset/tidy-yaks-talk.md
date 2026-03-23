---
"@lapal0ma/lcm-pg": patch
---

Fix M4 follow-ups for PG search reliability and safety:

- return mirror-search partial failures as structured `errors` and surface them in `lcm_mirror_search`
- escape `%` and `_` in mirror/shared keyword searches so query text is treated literally
- document `knowledge_roles` threat-model assumptions and search wildcard behavior in README
