-- ============================================================
-- TASK COMMENTS (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  author TEXT NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'comment',
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- ============================================================
-- DRAFT ACTIONS (Phase 4 — table created now, API later)
-- ============================================================
CREATE TABLE IF NOT EXISTS draft_actions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  lead_id TEXT,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL DEFAULT 'agent',
  reviewed_at TEXT,
  reviewed_by TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
CREATE INDEX IF NOT EXISTS idx_draft_actions_status ON draft_actions(status);
CREATE INDEX IF NOT EXISTS idx_draft_actions_task ON draft_actions(task_id);

-- ============================================================
-- LEADS STATUS (Phase 3 — column added now)
-- ============================================================
-- SQLite ALTER TABLE ADD COLUMN does not support DEFAULT with NOT NULL
-- on existing rows, so we use a safe default pattern
ALTER TABLE leads ADD COLUMN lead_status TEXT DEFAULT 'new';
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
