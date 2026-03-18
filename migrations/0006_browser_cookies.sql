-- ============================================================
-- BROWSER COOKIES (for headless browser session persistence)
-- Stores exported cookies per domain for injection into
-- the sandbox headless browser (e.g., LinkedIn auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS browser_cookies (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  cookies_json TEXT NOT NULL,
  label TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_cookies_domain ON browser_cookies(domain);
