-- ============================================================
-- BLOCKING COMMENTS (Phase 3)
-- Add resolved_at to support blocking comments that must be
-- resolved before a task can move to "done".
-- ============================================================
ALTER TABLE task_comments ADD COLUMN resolved_at TEXT;
CREATE INDEX IF NOT EXISTS idx_task_comments_blocking ON task_comments(task_id, comment_type, resolved_at);
