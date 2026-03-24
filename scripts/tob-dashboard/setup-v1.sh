#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_URL="postgresql://$(whoami)@localhost:5432/lcm_demo"

PG_URL="${1:-${LCM_DEMO_PG_URL:-${TEST_PG_URL:-$DEFAULT_URL}}}"

echo "[lcm-pg] Using PostgreSQL URL: ${PG_URL}"
echo "[lcm-pg] Seeding deterministic mock data..."
psql "${PG_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/sql/tob-dashboard/v1_seed_mock_data.sql"

echo "[lcm-pg] Creating dashboard views..."
psql "${PG_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/sql/tob-dashboard/v1_views.sql"

echo "[lcm-pg] Done."
echo "[lcm-pg] Quick checks:"
echo "  psql \"${PG_URL}\" -c \"select * from vw_context_shift_hourly limit 5;\""
echo "  psql \"${PG_URL}\" -c \"select * from vw_topic_momentum_7d limit 10;\""
