#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_URL="postgresql://$(whoami)@localhost:5432/lcm_demo"
PG_URL="${1:-${LCM_DEMO_PG_URL:-${TEST_PG_URL:-$DEFAULT_URL}}}"

echo "[lcm-pg] Demo-ready pipeline v1"
echo "[lcm-pg] DB: ${PG_URL}"

"${ROOT_DIR}/scripts/tob-dashboard/setup-v1.sh" "${PG_URL}"
"${ROOT_DIR}/scripts/tob-dashboard/qa-v1.sh" "${PG_URL}"

echo "[lcm-pg] Environment is demo-ready."
