-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'medium',
  health TEXT NOT NULL DEFAULT 'on_track',
  percent_complete INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  target_date TEXT,
  completed_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);

-- ============================================================
-- GOALS (per-project or standalone)
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  metric TEXT,
  target_value TEXT,
  current_value TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  target_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);

-- ============================================================
-- MILESTONES (per-project)
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  percent_complete INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  completed_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  milestone_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  deadline TEXT,
  completed_date TEXT,
  blocked_reason TEXT,
  deferred_until TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (milestone_id) REFERENCES milestones(id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);

-- ============================================================
-- BLOCKERS
-- ============================================================
CREATE TABLE IF NOT EXISTS blockers (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'medium',
  resolved_at TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);

-- ============================================================
-- DAILY CHECK-INS
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY,
  checkin_date TEXT NOT NULL,
  checkin_type TEXT NOT NULL,
  summary TEXT,
  tasks_planned TEXT,
  tasks_completed TEXT,
  tasks_rolled TEXT,
  mood TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON daily_checkins(checkin_date);
CREATE INDEX IF NOT EXISTS idx_checkins_type ON daily_checkins(checkin_type);

-- ============================================================
-- REMINDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  remind_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  related_project_id TEXT,
  related_task_id TEXT,
  recurrence TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (related_project_id) REFERENCES projects(id),
  FOREIGN KEY (related_task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_reminders_status_time ON reminders(status, remind_at);

-- ============================================================
-- PROGRESS SNAPSHOTS (daily rollup for trending)
-- ============================================================
CREATE TABLE IF NOT EXISTS progress_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  project_id TEXT NOT NULL,
  percent_complete INTEGER,
  open_tasks INTEGER,
  completed_tasks INTEGER,
  open_blockers INTEGER,
  health TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_date ON progress_snapshots(project_id, snapshot_date);

-- ============================================================
-- AGENT ACTION LOG (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT,
  source TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_logs_action ON agent_logs(action);
CREATE INDEX IF NOT EXISTS idx_agent_logs_time ON agent_logs(created_at);
