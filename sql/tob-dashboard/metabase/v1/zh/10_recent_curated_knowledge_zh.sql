-- 中文示例：最新精选知识
-- 建议图表：表格

SELECT
  updated_at AS "更新时间",
  owner_agent_id AS "所有者Agent",
  visibility AS "可见性",
  coalesce(title, '(未命名)') AS "标题",
  array_to_string(tags, ', ') AS "标签",
  array_to_string(visible_to, ', ') AS "可见角色",
  array_to_string(editable_by, ', ') AS "可编辑角色",
  left(regexp_replace(content, '\s+', ' ', 'g'), 260) AS "内容摘要"
FROM shared_knowledge
ORDER BY updated_at DESC
LIMIT 120;
