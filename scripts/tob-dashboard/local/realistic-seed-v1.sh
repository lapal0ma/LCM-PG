#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEFAULT_SQLITE="$HOME/.openclaw/lcm.db"
DEFAULT_DB_URL="postgresql://$(whoami)@localhost:5432/lcm_demo"
DEFAULT_OUT_DIR="${ROOT_DIR}/.demo-local/tob-dashboard"

SQLITE_PATH="${SQLITE_PATH:-$DEFAULT_SQLITE}"
DB_URL="${DB_URL:-$DEFAULT_DB_URL}"
OUT_DIR="${OUT_DIR:-$DEFAULT_OUT_DIR}"
LIMIT="${LIMIT:-180}"
MIRROR_ROWS="${MIRROR_ROWS:-320}"
SHARED_ROWS="${SHARED_ROWS:-60}"
APPLY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sqlite)
      SQLITE_PATH="${2:-$SQLITE_PATH}"
      shift 2
      ;;
    --db-url)
      DB_URL="${2:-$DB_URL}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-$OUT_DIR}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-$LIMIT}"
      shift 2
      ;;
    --mirror-rows)
      MIRROR_ROWS="${2:-$MIRROR_ROWS}"
      shift 2
      ;;
    --shared-rows)
      SHARED_ROWS="${2:-$SHARED_ROWS}"
      shift 2
      ;;
    --apply)
      APPLY="true"
      shift 1
      ;;
    --help|-h)
      cat <<'EOF'
Usage:
  scripts/tob-dashboard/local/realistic-seed-v1.sh [options]

Options:
  --sqlite <path>        Source OpenClaw LCM SQLite DB (default: ~/.openclaw/lcm.db)
  --db-url <url>         Target PG URL for optional apply (default: postgresql://$(whoami)@localhost:5432/lcm_demo)
  --out-dir <path>       Local output directory (default: .demo-local/tob-dashboard)
  --limit <n>            Max redacted corpus rows extracted from SQLite (default: 180)
  --mirror-rows <n>      Generated realistic mirror rows (default: 320)
  --shared-rows <n>      Generated realistic shared knowledge rows (default: 60)
  --apply                Apply generated SQL into target PG DB

Security:
  Generated realistic artifacts are local-only and ignored by git.
EOF
      exit 0
      ;;
    *)
      echo "[lcm-pg] unknown arg: $1"
      exit 1
      ;;
  esac
done

CORPUS_PATH="${OUT_DIR}/redacted-corpus.jsonl"
SEED_SQL_PATH="${OUT_DIR}/generated/realistic_seed_v1.demo.local.sql"

echo "[lcm-pg] realistic seed pipeline (local-only)"
echo "[lcm-pg] sqlite=${SQLITE_PATH}"
echo "[lcm-pg] out_dir=${OUT_DIR}"
echo "[lcm-pg] db_url=${DB_URL}"

node "${ROOT_DIR}/scripts/tob-dashboard/local/extract-redacted-corpus.mjs" \
  --sqlite "${SQLITE_PATH}" \
  --out "${CORPUS_PATH}" \
  --limit "${LIMIT}"

node "${ROOT_DIR}/scripts/tob-dashboard/local/generate-realistic-seed-sql.mjs" \
  --corpus "${CORPUS_PATH}" \
  --out-sql "${SEED_SQL_PATH}" \
  --mirror-rows "${MIRROR_ROWS}" \
  --shared-rows "${SHARED_ROWS}"

echo "[lcm-pg] generated sql: ${SEED_SQL_PATH}"

if [[ "${APPLY}" == "true" ]]; then
  echo "[lcm-pg] applying realistic local SQL to ${DB_URL} ..."
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${SEED_SQL_PATH}"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/sql/tob-dashboard/v1_views.sql"
  echo "[lcm-pg] apply done."
else
  echo "[lcm-pg] apply skipped (use --apply to insert into PostgreSQL)."
fi
