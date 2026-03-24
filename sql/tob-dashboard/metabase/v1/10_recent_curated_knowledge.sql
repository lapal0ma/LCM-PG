-- Card: Recent Curated Knowledge
-- Viz: table
-- Purpose: show latest curated entries with visibility + tags.

SELECT
  updated_at,
  owner_agent_id,
  visibility,
  coalesce(title, '(untitled)') AS title,
  array_to_string(tags, ', ') AS tags_csv,
  array_to_string(visible_to, ', ') AS visible_to_roles,
  array_to_string(editable_by, ', ') AS editable_by_roles,
  left(regexp_replace(content, '\s+', ' ', 'g'), 260) AS content_snippet
FROM shared_knowledge
ORDER BY updated_at DESC
LIMIT 120;
