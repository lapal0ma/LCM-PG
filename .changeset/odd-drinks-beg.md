---
"@lapal0ma/lcm-pg": patch
---

Drain pending PG mirror writes before plugin shutdown and close mirror pools
after the queue has flushed.

This reduces the chance of losing the latest mirrored summaries during gateway
restarts or deploys by making `dispose()` wait for already-enqueued mirror jobs
before cleaning up PostgreSQL connections.
