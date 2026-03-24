-- Card: Context Volume Daily
-- Viz: stacked bar
-- X: day, Breakout: agent_id
-- Y: snapshots (or avg_content_chars as toggle)

SELECT
  day,
  agent_id,
  snapshots,
  active_conversations,
  avg_content_chars,
  p95_content_chars,
  avg_summary_nodes
FROM vw_context_volume_daily
WHERE day >= current_date - 30
ORDER BY day ASC, agent_id ASC;
