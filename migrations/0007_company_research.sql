-- ============================================================
-- COMPANY RESEARCH (structured intel per lead)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_research (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  source_label TEXT,
  confidence TEXT DEFAULT 'medium',
  gathered_by TEXT DEFAULT 'agent',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_research_lead ON company_research(lead_id);
CREATE INDEX IF NOT EXISTS idx_research_category ON company_research(lead_id, category);
CREATE INDEX IF NOT EXISTS idx_research_created ON company_research(created_at);
