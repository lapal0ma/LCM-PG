-- LCM-PG toB dashboard v1 views
-- Decisions aligned with docs/tob-dashboard-demo-flow-plan.md §8:
-- - SQL-view-only stack
-- - Single-workspace demo
-- - Topic analytics from tags only

CREATE OR REPLACE VIEW vw_context_shift_hourly AS
WITH ordered AS (
  SELECT
    mirror_id,
    agent_id,
    conversation_id,
    captured_at,
    date_trunc('hour', captured_at) AS bucket_hour,
    char_length(content) AS content_chars,
    COALESCE(jsonb_array_length(summary_ids), 0) AS summary_nodes,
    lag(char_length(content)) OVER (
      PARTITION BY conversation_id
      ORDER BY captured_at, mirror_id
    ) AS prev_content_chars,
    lag(COALESCE(jsonb_array_length(summary_ids), 0)) OVER (
      PARTITION BY conversation_id
      ORDER BY captured_at, mirror_id
    ) AS prev_summary_nodes
  FROM lcm_mirror
),
scored AS (
  SELECT
    bucket_hour,
    agent_id,
    conversation_id,
    content_chars,
    summary_nodes,
    CASE
      WHEN prev_content_chars IS NULL OR prev_content_chars = 0 THEN 0::numeric
      ELSE abs(content_chars - prev_content_chars)::numeric / prev_content_chars
    END AS content_delta_ratio,
    CASE
      WHEN prev_summary_nodes IS NULL THEN 0::numeric
      WHEN prev_summary_nodes = 0 AND summary_nodes = 0 THEN 0::numeric
      WHEN prev_summary_nodes = 0 AND summary_nodes > 0 THEN 1::numeric
      ELSE abs(summary_nodes - prev_summary_nodes)::numeric / prev_summary_nodes
    END AS node_delta_ratio
  FROM ordered
)
SELECT
  bucket_hour,
  agent_id,
  count(*) AS snapshots,
  count(DISTINCT conversation_id) AS active_conversations,
  round(avg(content_chars)::numeric, 2) AS avg_content_chars,
  round(avg(summary_nodes)::numeric, 2) AS avg_summary_nodes,
  round(avg((content_delta_ratio * 0.7) + (node_delta_ratio * 0.3)), 4) AS shift_score_avg,
  round(max((content_delta_ratio * 0.7) + (node_delta_ratio * 0.3)), 4) AS shift_score_peak
FROM scored
GROUP BY bucket_hour, agent_id
ORDER BY bucket_hour DESC, agent_id;

CREATE OR REPLACE VIEW vw_context_volume_daily AS
SELECT
  date_trunc('day', captured_at)::date AS day,
  agent_id,
  count(*) AS snapshots,
  count(DISTINCT conversation_id) AS active_conversations,
  round(avg(char_length(content))::numeric, 2) AS avg_content_chars,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY char_length(content))::numeric, 2) AS p95_content_chars,
  round(avg(COALESCE(jsonb_array_length(summary_ids), 0))::numeric, 2) AS avg_summary_nodes
FROM lcm_mirror
GROUP BY day, agent_id
ORDER BY day DESC, agent_id;

CREATE OR REPLACE VIEW vw_topic_trends_daily AS
WITH expanded AS (
  SELECT
    date_trunc('day', updated_at)::date AS day,
    lower(trim(tag)) AS tag,
    visibility,
    owner_agent_id
  FROM shared_knowledge
  CROSS JOIN LATERAL unnest(tags) AS tag
  WHERE trim(tag) <> ''
)
SELECT
  day,
  tag,
  count(*) AS entries,
  count(*) FILTER (WHERE visibility = 'shared') AS shared_entries,
  count(*) FILTER (WHERE visibility = 'restricted') AS restricted_entries,
  count(*) FILTER (WHERE visibility = 'private') AS private_entries,
  count(DISTINCT owner_agent_id) AS distinct_owners
FROM expanded
GROUP BY day, tag
ORDER BY day DESC, entries DESC, tag;

CREATE OR REPLACE VIEW vw_topic_momentum_7d AS
WITH anchor AS (
  SELECT COALESCE(max(date_trunc('day', updated_at)::date), current_date) AS anchor_day
  FROM shared_knowledge
),
daily AS (
  SELECT
    date_trunc('day', updated_at)::date AS day,
    lower(trim(tag)) AS tag,
    count(*) AS entries
  FROM shared_knowledge
  CROSS JOIN LATERAL unnest(tags) AS tag
  WHERE trim(tag) <> ''
  GROUP BY 1, 2
),
windowed AS (
  SELECT
    d.tag,
    a.anchor_day,
    sum(d.entries) FILTER (WHERE d.day BETWEEN a.anchor_day - 6 AND a.anchor_day) AS recent_7d,
    sum(d.entries) FILTER (WHERE d.day BETWEEN a.anchor_day - 13 AND a.anchor_day - 7) AS previous_7d
  FROM daily d
  CROSS JOIN anchor a
  GROUP BY d.tag, a.anchor_day
)
SELECT
  anchor_day,
  tag,
  COALESCE(recent_7d, 0) AS recent_7d,
  COALESCE(previous_7d, 0) AS previous_7d,
  COALESCE(recent_7d, 0) - COALESCE(previous_7d, 0) AS delta_7d,
  CASE
    WHEN COALESCE(previous_7d, 0) = 0 THEN NULL
    ELSE round(
      (COALESCE(recent_7d, 0) - COALESCE(previous_7d, 0))::numeric
      / previous_7d::numeric,
      4
    )
  END AS growth_ratio
FROM windowed
WHERE COALESCE(recent_7d, 0) > 0 OR COALESCE(previous_7d, 0) > 0
ORDER BY delta_7d DESC, recent_7d DESC, tag;

CREATE OR REPLACE VIEW vw_governance_visibility_daily AS
SELECT
  date_trunc('day', updated_at)::date AS day,
  count(*) AS total_entries,
  count(*) FILTER (WHERE visibility = 'shared') AS shared_entries,
  count(*) FILTER (WHERE visibility = 'restricted') AS restricted_entries,
  count(*) FILTER (WHERE visibility = 'private') AS private_entries,
  round(
    (count(*) FILTER (WHERE visibility = 'restricted'))::numeric
    / NULLIF(count(*), 0)::numeric,
    4
  ) AS restricted_ratio
FROM shared_knowledge
GROUP BY day
ORDER BY day DESC;

CREATE OR REPLACE VIEW vw_governance_role_matrix AS
WITH role_base AS (
  SELECT
    agent_id,
    role,
    granted_at
  FROM knowledge_roles
),
knowledge AS (
  SELECT
    knowledge_id,
    owner_agent_id,
    visibility,
    visible_to,
    editable_by
  FROM shared_knowledge
)
SELECT
  rb.agent_id,
  rb.role,
  rb.granted_at,
  count(k.knowledge_id) FILTER (
    WHERE k.visibility = 'shared'
      OR (k.visibility = 'restricted' AND rb.role = ANY(k.visible_to))
      OR k.owner_agent_id = rb.agent_id
  ) AS readable_entries,
  count(k.knowledge_id) FILTER (
    WHERE rb.role = ANY(k.editable_by)
      OR k.owner_agent_id = rb.agent_id
  ) AS editable_entries,
  count(k.knowledge_id) FILTER (
    WHERE k.visibility = 'restricted'
      AND rb.role = ANY(k.visible_to)
  ) AS restricted_readable_entries
FROM role_base rb
LEFT JOIN knowledge k ON TRUE
GROUP BY rb.agent_id, rb.role, rb.granted_at
ORDER BY rb.agent_id, rb.role;
