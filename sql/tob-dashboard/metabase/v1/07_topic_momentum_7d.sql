-- Card: Topic Momentum (7d vs previous 7d)
-- Viz: table (sortable), optionally bar by delta_7d

SELECT
  anchor_day,
  tag,
  recent_7d,
  previous_7d,
  delta_7d,
  growth_ratio
FROM vw_topic_momentum_7d
ORDER BY delta_7d DESC, recent_7d DESC, tag ASC
LIMIT 25;
