-- LCM-PG toB dashboard v1 mock data seeding
-- Deterministic enough for repeatable local demos on MacBook.

BEGIN;

-- Keep schema ready even before plugin runtime writes first rows.
CREATE TABLE IF NOT EXISTS lcm_mirror (
  mirror_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL,
  conversation_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'latest_nodes',
  content TEXT NOT NULL,
  summary_ids JSONB NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL,
  session_id TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, content_hash)
);

CREATE INDEX IF NOT EXISTS lcm_mirror_session_key_idx
  ON lcm_mirror (session_key, ingested_at DESC);
CREATE INDEX IF NOT EXISTS lcm_mirror_agent_idx
  ON lcm_mirror (agent_id, ingested_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_roles (
  agent_id    TEXT NOT NULL,
  role        TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, role)
);

CREATE INDEX IF NOT EXISTS kr_role_idx ON knowledge_roles (role);

CREATE TABLE IF NOT EXISTS shared_knowledge (
  knowledge_id      UUID PRIMARY KEY,
  owner_agent_id    TEXT NOT NULL,
  visibility        TEXT NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('shared', 'restricted', 'private')),
  visible_to        TEXT[] NOT NULL DEFAULT '{}',
  editable_by       TEXT[] NOT NULL DEFAULT '{}',
  title             TEXT,
  content           TEXT NOT NULL,
  source_mirror_ids UUID[] NOT NULL DEFAULT '{}',
  tags              TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sk_visibility_idx ON shared_knowledge (visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS sk_owner_idx ON shared_knowledge (owner_agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS sk_tags_idx ON shared_knowledge USING GIN (tags);
CREATE INDEX IF NOT EXISTS sk_visible_to_idx ON shared_knowledge USING GIN (visible_to);
CREATE INDEX IF NOT EXISTS sk_editable_by_idx ON shared_knowledge USING GIN (editable_by);

-- Seed baseline roles used by v1 dashboard narrative.
INSERT INTO knowledge_roles (agent_id, role) VALUES
  ('main', 'admin'),
  ('infra', 'researcher'),
  ('finance', 'cost-analyst'),
  ('security', 'compliance-reviewer')
ON CONFLICT (agent_id, role) DO NOTHING;

-- If shared-knowledge RLS policies are present, these settings align with admin bypass.
SELECT set_config('app.agent_id', 'main', true);
SELECT set_config('app.admin_role', 'admin', true);

-- Mirror rows: ~35% sampling over 72 hours x 12 conversations => roughly 240-360 rows.
WITH agents AS (
  SELECT *
  FROM (VALUES
    (1, 'infra'),
    (2, 'finance'),
    (3, 'security'),
    (4, 'main')
  ) AS t(agent_ord, agent_id)
),
conversations AS (
  SELECT
    a.agent_id,
    gs AS conv_idx,
    (10000 + (a.agent_ord * 100) + gs)::bigint AS conversation_id,
    format('agent:%s:demo-%s', a.agent_id, gs) AS session_key,
    format('session-%s-%s', a.agent_id, gs) AS session_id
  FROM agents a
  CROSS JOIN generate_series(1, 3) AS gs
),
hours AS (
  SELECT
    generate_series(
      date_trunc('hour', now()) - interval '71 hour',
      date_trunc('hour', now()),
      interval '1 hour'
    ) AS captured_at
),
topic_map AS (
  SELECT *
  FROM (VALUES
    ('infra', 'latency benchmark migration architecture'),
    ('finance', 'cost tco decision budget waf'),
    ('security', 'compliance governance security risk controls'),
    ('main', 'cross-team synthesis decision memo')
  ) AS t(agent_id, topic_terms)
),
candidate_rows AS (
  SELECT
    c.session_key,
    c.conversation_id,
    c.agent_id,
    CASE
      WHEN (extract(hour FROM h.captured_at)::int % 2) = 0 THEN 'latest_nodes'
      ELSE 'root_view'
    END AS mode,
    format(
      'Agent=%s conversation=%s captured_at=%s topics=%s phase=%s %s',
      c.agent_id,
      c.conversation_id,
      to_char(h.captured_at, 'YYYY-MM-DD HH24:MI'),
      tm.topic_terms,
      (extract(hour FROM h.captured_at)::int % 6),
      repeat(
        CASE
          WHEN c.agent_id = 'infra' THEN 'cold-start latency measurement '
          WHEN c.agent_id = 'finance' THEN 'cost model scenario analysis '
          WHEN c.agent_id = 'security' THEN 'compliance control validation '
          ELSE 'cross-team summary alignment '
        END,
        4 + ((extract(hour FROM h.captured_at)::int + c.conv_idx) % 7)
      )
    ) AS content,
    jsonb_build_array(
      format('sum_%s_%s_%s_a', c.agent_id, c.conv_idx, to_char(h.captured_at, 'YYYYMMDDHH24')),
      format('sum_%s_%s_%s_b', c.agent_id, c.conv_idx, to_char(h.captured_at, 'YYYYMMDDHH24'))
    ) AS summary_ids,
    md5(format('%s|%s|v1', c.conversation_id, to_char(h.captured_at, 'YYYYMMDDHH24MI'))) AS content_hash,
    c.session_id,
    h.captured_at
  FROM conversations c
  JOIN hours h ON TRUE
  JOIN topic_map tm ON tm.agent_id = c.agent_id
  WHERE mod(
    abs((('x' || substr(md5(format(
      '%s|%s|%s',
      c.agent_id,
      c.conversation_id,
      to_char(h.captured_at, 'YYYYMMDDHH24')
    )), 1, 8))::bit(32)::int)),
    100
  ) < 35
)
INSERT INTO lcm_mirror (
  session_key,
  conversation_id,
  agent_id,
  mode,
  content,
  summary_ids,
  content_hash,
  session_id,
  captured_at
)
SELECT
  session_key,
  conversation_id,
  agent_id,
  mode,
  content,
  summary_ids,
  content_hash,
  session_id,
  captured_at
FROM candidate_rows
ON CONFLICT (conversation_id, content_hash) DO NOTHING;

WITH tag_pool AS (
  SELECT ARRAY[
    'latency',
    'cost',
    'compliance',
    'risk',
    'timeline',
    'migration',
    'ops',
    'security',
    'architecture',
    'decision',
    'waf',
    'cold-start'
  ]::text[] AS tags
),
base AS (
  SELECT
    gs AS idx,
    (
      substr(md5(format('sk:%s', gs)), 1, 8) || '-' ||
      substr(md5(format('sk:%s', gs)), 9, 4) || '-' ||
      '4' || substr(md5(format('sk:%s', gs)), 14, 3) || '-' ||
      'a' || substr(md5(format('sk:%s', gs)), 18, 3) || '-' ||
      substr(md5(format('sk:%s', gs)), 21, 12)
    )::uuid AS knowledge_id,
    CASE
      WHEN gs % 10 = 0 THEN 'private'
      WHEN gs % 10 BETWEEN 1 AND 3 THEN 'restricted'
      ELSE 'shared'
    END AS visibility,
    CASE
      WHEN gs % 4 = 0 THEN 'infra'
      WHEN gs % 4 = 1 THEN 'finance'
      WHEN gs % 4 = 2 THEN 'security'
      ELSE 'main'
    END AS owner_agent_id,
    (SELECT tags[((gs % array_length(tags, 1)) + 1)] FROM tag_pool) AS tag_a,
    (SELECT tags[(((gs * 3) % array_length(tags, 1)) + 1)] FROM tag_pool) AS tag_b
  FROM generate_series(1, 60) AS gs
),
rows AS (
  SELECT
    knowledge_id,
    owner_agent_id,
    visibility,
    CASE
      WHEN visibility = 'restricted' AND idx % 3 = 0 THEN ARRAY['compliance-reviewer']::text[]
      WHEN visibility = 'restricted' AND idx % 3 = 1 THEN ARRAY['cost-analyst']::text[]
      WHEN visibility = 'restricted' THEN ARRAY['researcher']::text[]
      ELSE ARRAY[]::text[]
    END AS visible_to,
    CASE
      WHEN visibility = 'private' THEN ARRAY[]::text[]
      ELSE ARRAY['admin']::text[]
    END AS editable_by,
    format('Demo Knowledge %s - %s', idx, initcap(replace(tag_a, '-', ' '))) AS title,
    format(
      'Seeded demo knowledge #%s. Primary topic=%s. Secondary topic=%s. This supports dashboard topic and governance visualizations.',
      idx,
      tag_a,
      tag_b
    ) AS content,
    ARRAY[]::uuid[] AS source_mirror_ids,
    CASE
      WHEN tag_a = tag_b THEN ARRAY[tag_a]::text[]
      ELSE ARRAY[tag_a, tag_b]::text[]
    END AS tags,
    now() - make_interval(hours => (60 - idx)) AS created_at,
    now() - make_interval(hours => ((60 - idx) / 2)) AS updated_at
  FROM base
)
INSERT INTO shared_knowledge (
  knowledge_id,
  owner_agent_id,
  visibility,
  visible_to,
  editable_by,
  title,
  content,
  source_mirror_ids,
  tags,
  created_at,
  updated_at
)
SELECT
  knowledge_id,
  owner_agent_id,
  visibility,
  visible_to,
  editable_by,
  title,
  content,
  source_mirror_ids,
  tags,
  created_at,
  updated_at
FROM rows
ON CONFLICT (knowledge_id) DO NOTHING;

COMMIT;

-- Summary counters for quick operator verification.
SELECT 'lcm_mirror_rows' AS metric, count(*)::bigint AS value FROM lcm_mirror
UNION ALL
SELECT 'shared_knowledge_rows' AS metric, count(*)::bigint AS value FROM shared_knowledge
UNION ALL
SELECT 'knowledge_roles_rows' AS metric, count(*)::bigint AS value FROM knowledge_roles;
