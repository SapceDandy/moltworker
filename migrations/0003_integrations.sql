-- ============================================================
-- INTEGRATIONS (Google OAuth tokens, multi-account)
-- ============================================================
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'google',
  account_email TEXT,
  account_label TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_expiry TEXT,
  scopes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_integrations_email ON integrations(account_email);
