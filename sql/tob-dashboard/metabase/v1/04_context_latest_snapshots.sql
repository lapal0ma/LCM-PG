-- Card: Latest Mirror Snapshots
-- Viz: table
-- Purpose: operator drill-down and spot checks.

SELECT
  captured_at,
  agent_id,
  conversation_id,
  mode,
  char_length(content) AS content_chars,
  COALESCE(jsonb_array_length(summary_ids), 0) AS summary_nodes,
  left(regexp_replace(content, '\s+', ' ', 'g'), 220) AS content_snippet
FROM lcm_mirror
ORDER BY captured_at DESC
LIMIT 150;
