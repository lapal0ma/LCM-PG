-- 中文示例：上下文迁移趋势（按 Agent）
-- 建议图表：折线图

SELECT
  bucket_hour AS "快照时间",
  agent_id AS "Agent",
  shift_score_avg AS "平均迁移分数",
  shift_score_peak AS "峰值迁移分数",
  snapshots AS "快照数",
  active_conversations AS "活跃会话数"
FROM vw_context_shift_hourly
WHERE bucket_hour >= now() - interval '72 hours'
ORDER BY bucket_hour ASC, agent_id ASC;
