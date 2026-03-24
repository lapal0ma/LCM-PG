-- Card: Governance Role Matrix
-- Viz: table
-- Purpose: role coverage and readable/editable footprint.

SELECT
  agent_id,
  role,
  readable_entries,
  restricted_readable_entries,
  editable_entries,
  granted_at
FROM vw_governance_role_matrix
ORDER BY agent_id ASC, role ASC;
