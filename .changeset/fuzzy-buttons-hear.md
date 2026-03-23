---
"@lapal0ma/lcm-pg": patch
---

Honor mirror queue concurrency settings and stop defaulting mirror writes to
the `main` agent when no parseable session key is available.

Mirror jobs now use the configured queue concurrency, and the mirror write path
falls back to a persisted conversation session key when possible. If no trusted
agent identity can be resolved, the plugin skips the mirror write with a
warning instead of silently misrouting the row.
