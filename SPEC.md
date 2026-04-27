# LCM-PG Specification

This repository keeps implementation notes and database specifications for the
LCM-PG demo stack.

## Current Specification

- Detailed toB dashboard v1 database spec:
  [`docs/tob-dashboard-v1-spec.md`](docs/tob-dashboard-v1-spec.md)

That document covers the current `lcm_demo` PostgreSQL schema, including:

- Public tables: `lcm_mirror`, `shared_knowledge`, `knowledge_roles`
- Public views used by the Metabase dashboard
- Column data types, indexes, constraints, and storage semantics
- Text/string statistics from the current local demo dataset
- Metabase SQL card mapping
- A forward-looking roadmap for a PostgreSQL `md` Markdown data type

## Data Safety

Generated demo CSVs and local realistic datasets are local artifacts only. Do
not commit raw workspace exports, generated private data, or demo-local CSV
outputs to the remote repository.
