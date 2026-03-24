-- Card: Governance Visibility Mix
-- Viz: stacked bar or line
-- X: day, Y: shared/restricted/private entries

SELECT
  day,
  total_entries,
  shared_entries,
  restricted_entries,
  private_entries,
  restricted_ratio
FROM vw_governance_visibility_daily
WHERE day >= current_date - 30
ORDER BY day ASC;
