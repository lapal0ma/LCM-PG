#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_URL="postgresql://$(whoami)@localhost:5432/lcm_demo"
PG_URL="${1:-${LCM_DEMO_PG_URL:-${TEST_PG_URL:-$DEFAULT_URL}}}"

SPIKE_THRESHOLD="${SHIFT_SPIKE_THRESHOLD:-0.25}"
MIRROR_MIN_ROWS="${MIRROR_MIN_ROWS:-200}"
SHARED_MIN_ROWS="${SHARED_MIN_ROWS:-40}"
ROLES_MIN_ROWS="${ROLES_MIN_ROWS:-4}"
TAGS_MIN_COUNT="${TAGS_MIN_COUNT:-8}"
RESTRICTED_MIN_COUNT="${RESTRICTED_MIN_COUNT:-1}"
SPIKES_MIN_COUNT="${SPIKES_MIN_COUNT:-2}"

pass_count=0
fail_count=0

pass() {
  echo "[PASS] $1"
  pass_count=$((pass_count + 1))
}

fail() {
  echo "[FAIL] $1"
  fail_count=$((fail_count + 1))
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing command: $1"
    exit 1
  fi
}

sql_scalar() {
  local q="$1"
  psql "${PG_URL}" -v ON_ERROR_STOP=1 -Atqc "${q}"
}

as_int() {
  local v="${1:-0}"
  v="${v%%.*}"
  if [[ -z "${v}" || "${v}" == "null" ]]; then
    echo "0"
    return
  fi
  echo "${v}"
}

cmp_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'
}

check_ge() {
  local name="$1"
  local value="$2"
  local min="$3"
  if cmp_ge "${value}" "${min}"; then
    pass "${name}: ${value} >= ${min}"
  else
    fail "${name}: ${value} < ${min}"
  fi
}

check_view_exists() {
  local view="$1"
  local exists
  exists="$(sql_scalar "SELECT count(*) FROM information_schema.views WHERE table_schema='public' AND table_name='${view}';")"
  exists="$(as_int "${exists}")"
  if [[ "${exists}" -ge 1 ]]; then
    pass "view exists: ${view}"
  else
    fail "view missing: ${view} (run ${ROOT_DIR}/sql/tob-dashboard/v1_views.sql)"
  fi
}

echo "[lcm-pg] QA v1 starting"
echo "[lcm-pg] DB: ${PG_URL}"
echo "[lcm-pg] thresholds: mirror>=${MIRROR_MIN_ROWS}, shared>=${SHARED_MIN_ROWS}, roles>=${ROLES_MIN_ROWS}, tags>=${TAGS_MIN_COUNT}, restricted>=${RESTRICTED_MIN_COUNT}, spikes>=${SPIKES_MIN_COUNT}, spike_threshold>=${SPIKE_THRESHOLD}"

need_cmd psql

if psql "${PG_URL}" -v ON_ERROR_STOP=1 -Atqc "SELECT 1;" >/dev/null 2>&1; then
  pass "database connectivity"
else
  echo "[ERROR] cannot connect to PostgreSQL at ${PG_URL}"
  echo "Hint: run scripts/tob-dashboard/setup-v1.sh first."
  exit 1
fi

# Required views (Step 1 deliverables).
for v in \
  vw_context_shift_hourly \
  vw_context_volume_daily \
  vw_topic_trends_daily \
  vw_topic_momentum_7d \
  vw_governance_visibility_daily \
  vw_governance_role_matrix
do
  check_view_exists "${v}"
done

# Core dataset size checks.
mirror_rows="$(as_int "$(sql_scalar "SELECT count(*) FROM lcm_mirror;")")"
shared_rows="$(as_int "$(sql_scalar "SELECT count(*) FROM shared_knowledge;")")"
roles_rows="$(as_int "$(sql_scalar "SELECT count(*) FROM knowledge_roles;")")"

check_ge "lcm_mirror row count" "${mirror_rows}" "${MIRROR_MIN_ROWS}"
check_ge "shared_knowledge row count" "${shared_rows}" "${SHARED_MIN_ROWS}"
check_ge "knowledge_roles row count" "${roles_rows}" "${ROLES_MIN_ROWS}"

# Topic quality checks (tags-only v1 decision).
distinct_tags_30d="$(as_int "$(sql_scalar "SELECT count(DISTINCT tag) FROM vw_topic_trends_daily WHERE day >= current_date - 30;")")"
check_ge "distinct topic tags in last 30d" "${distinct_tags_30d}" "${TAGS_MIN_COUNT}"

# Governance checks.
restricted_entries_30d="$(as_int "$(sql_scalar "SELECT COALESCE(sum(restricted_entries),0) FROM vw_governance_visibility_daily WHERE day >= current_date - 30;")")"
check_ge "restricted entries in last 30d" "${restricted_entries_30d}" "${RESTRICTED_MIN_COUNT}"

role_matrix_rows="$(as_int "$(sql_scalar "SELECT count(*) FROM vw_governance_role_matrix;")")"
check_ge "role matrix rows" "${role_matrix_rows}" "${ROLES_MIN_ROWS}"

# Context-shift demo signal checks.
spike_count_72h="$(as_int "$(sql_scalar "SELECT count(*) FROM vw_context_shift_hourly WHERE bucket_hour >= now() - interval '72 hours' AND shift_score_peak >= ${SPIKE_THRESHOLD};")")"
check_ge "context shift spikes in last 72h" "${spike_count_72h}" "${SPIKES_MIN_COUNT}"

echo
echo "[lcm-pg] QA summary: pass=${pass_count}, fail=${fail_count}"
if [[ "${fail_count}" -gt 0 ]]; then
  echo "[lcm-pg] QA FAILED"
  exit 1
fi

echo "[lcm-pg] QA PASSED"
echo "[lcm-pg] Recommended next step: build/refresh Metabase dashboard cards from docs/tob-dashboard-v1-metabase-pack.md"
