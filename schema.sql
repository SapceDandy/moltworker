CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  business_name TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  category TEXT,
  owner_or_people TEXT,
  linkedin_company TEXT,
  linkedin_people TEXT,
  contact_page_url TEXT,
  source_urls TEXT,
  evidence_snippet TEXT,
  match_score INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(match_score);
