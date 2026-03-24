-- Card: KPI Overview (single-row table)
-- Purpose: headline health metrics for demo opening.

SELECT
  now() AS snapshot_ts,
  (SELECT count(*) FROM lcm_mirror) AS mirror_rows_total,
  (SELECT count(*) FROM shared_knowledge) AS shared_knowledge_rows_total,
  (SELECT count(*) FROM knowledge_roles) AS role_assignments_total,
  (SELECT count(*) FROM lcm_mirror WHERE captured_at >= now() - interval '24 hours') AS mirror_rows_24h,
  (
    SELECT COALESCE(round(avg(shift_score_avg), 4), 0)
    FROM vw_context_shift_hourly
    WHERE bucket_hour >= now() - interval '24 hours'
  ) AS avg_shift_score_24h,
  (
    SELECT COALESCE(count(*), 0)
    FROM shared_knowledge
    WHERE visibility = 'restricted'
  ) AS restricted_knowledge_rows;
