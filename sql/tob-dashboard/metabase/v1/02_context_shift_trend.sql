-- Card: Context Shift Trend by Agent
-- Viz: line chart
-- X: bucket_hour, Breakout: agent_id, Y: shift_score_avg

SELECT
  bucket_hour,
  agent_id,
  shift_score_avg,
  shift_score_peak,
  snapshots,
  active_conversations
FROM vw_context_shift_hourly
WHERE bucket_hour >= now() - interval '72 hours'
ORDER BY bucket_hour ASC, agent_id ASC;
