-- Card: Top Topic Tags (30d)
-- Viz: horizontal bar
-- X: entries_30d, Y: tag

SELECT
  tag,
  sum(entries) AS entries_30d,
  sum(shared_entries) AS shared_entries_30d,
  sum(restricted_entries) AS restricted_entries_30d,
  sum(private_entries) AS private_entries_30d
FROM vw_topic_trends_daily
WHERE day >= current_date - 30
GROUP BY tag
ORDER BY entries_30d DESC, tag ASC
LIMIT 15;
