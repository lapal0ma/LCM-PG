-- Card: Topic Daily Trend (Top 8 tags)
-- Viz: stacked area or multi-line
-- X: day, Breakout: tag, Y: entries

WITH top_tags AS (
  SELECT
    tag,
    sum(entries) AS total_entries
  FROM vw_topic_trends_daily
  WHERE day >= current_date - 30
  GROUP BY tag
  ORDER BY total_entries DESC, tag ASC
  LIMIT 8
)
SELECT
  t.day,
  t.tag,
  t.entries
FROM vw_topic_trends_daily t
JOIN top_tags x
  ON x.tag = t.tag
WHERE t.day >= current_date - 30
ORDER BY t.day ASC, t.tag ASC;
