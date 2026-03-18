import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listGoogleAccounts,
  disconnectGoogleAccount,
  getGoogleAuthUrl,
  type GoogleAccount,
  listBrowserCookies,
  storeBrowserCookies,
  deleteBrowserCookies,
  type BrowserCookieEntry,
} from '../api';
import './SettingsPage.css';

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Browser cookies state
  const [cookieEntries, setCookieEntries] = useState<BrowserCookieEntry[]>([]);
  const [showCookieForm, setShowCookieForm] = useState(false);
  const [cookieDomain, setCookieDomain] = useState('linkedin.com');
  const [cookieJson, setCookieJson] = useState('');
  const [cookieLabel, setCookieLabel] = useState('');
  const [cookieSaving, setCookieSaving] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<string | null>(null);

  const successMsg = searchParams.get('success');
  const errorMsg = searchParams.get('error');

  const load = useCallback(async () => {
    try {
      const [res, cookieRes] = await Promise.all([
        listGoogleAccounts(),
        listBrowserCookies(),
      ]);
      setAccounts(res.accounts);
      setCookieEntries(cookieRes.cookies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Clear URL params after showing message
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSearchParams({});
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg, setSearchParams]);

  const handleDisconnect = async (id: string, email: string) => {
    if (!confirm(`Disconnect ${email}? The agent will no longer have access to this account's calendar, tasks, and email.`)) return;
    try {
      await disconnectGoogleAccount(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const handleConnect = () => {
    const url = getGoogleAuthUrl(label || undefined);
    window.location.href = url;
  };

  const formatScopes = (scopes: string): string[] => {
    if (!scopes) return [];
    return scopes.split(' ').map((s) => {
      if (s.includes('calendar')) return 'Calendar (read/write)';
      if (s.includes('tasks')) return 'Tasks';
      if (s.includes('gmail')) return 'Gmail (read-only)';
      if (s.includes('userinfo')) return 'Profile';
      return s.split('/').pop() || s;
    });
  };

  if (loading) {
    return (
      <div className="dash-loading">
        <div className="spinner" />
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      {/* Status Messages */}
      {successMsg === 'connected' && (
        <div className="success-banner">Google account connected successfully!</div>
      )}
      {errorMsg && (
        <div className="error-banner">
          <span>Google connection failed: {errorMsg.replace(/_/g, ' ')}</span>
        </div>
      )}
      {error && (
        <div className="error-banner"><span>{error}</span></div>
      )}

      {/* Google Integration Section */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h3>Google Integration</h3>
            <p className="section-desc">
              Connect your Google accounts to give Kudjo access to your calendar, tasks, and email.
              The agent uses this to factor meetings into your schedule, sync tasks, and find action items.
            </p>
          </div>
        </div>

        {/* Connected Accounts */}
        {accounts.length > 0 && (
          <div className="accounts-list">
            {accounts.map((acc) => (
              <div key={acc.id} className="account-card">
                <div className="account-info">
                  <div className="account-primary">
                    <span className="account-email">{acc.email}</span>
                    {acc.label && <span className="account-label">{acc.label}</span>}
                    <span className={`token-status ${acc.token_valid ? 'valid' : 'expired'}`}>
                      {acc.token_valid ? 'Active' : 'Token expired'}
                    </span>
                  </div>
                  <div className="account-scopes">
                    {formatScopes(acc.scopes).map((scope) => (
                      <span key={scope} className="scope-tag">{scope}</span>
                    ))}
                  </div>
                  <div className="account-meta">
                    Connected {new Date(acc.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="account-actions">
                  {!acc.token_valid && (
                    <a href={getGoogleAuthUrl(acc.label || undefined)} className="btn btn-primary btn-sm">
                      Re-authorize
                    </a>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDisconnect(acc.id, acc.email)}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Connect New Account */}
        <div className="connect-section">
          {showLabelInput ? (
            <div className="connect-form">
              <div className="form-group">
                <label htmlFor="account-label">Account Label (optional)</label>
                <input
                  id="account-label"
                  placeholder="e.g., personal, work"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="connect-actions">
                <button className="btn btn-primary" onClick={handleConnect}>
                  Connect with Google
                </button>
                <button className="btn btn-secondary" onClick={() => { setShowLabelInput(false); setLabel(''); }}>
                  Cancel
                </button>
              </div>
              <p className="connect-hint">
                You'll be redirected to Google to authorize access to Calendar (read/write), Tasks, and Gmail (read-only).
              </p>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowLabelInput(true)}>
              + Connect Google Account
            </button>
          )}
        </div>
      </section>

      {/* Browser Cookies Section */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h3>Browser Sessions</h3>
            <p className="section-desc">
              Import cookies from your browser to give the agent access to authenticated sessions (e.g., LinkedIn).
              Use a browser extension like "EditThisCookie" or "Cookie-Editor" to export cookies as JSON.
            </p>
          </div>
        </div>

        {cookieMsg && (
          <div className="success-banner">{cookieMsg}</div>
        )}

        {/* Stored Cookies */}
        {cookieEntries.length > 0 && (
          <div className="accounts-list">
            {cookieEntries.map((entry) => (
              <div key={entry.id} className="account-card">
                <div className="account-info">
                  <div className="account-primary">
                    <span className="account-email">{entry.domain}</span>
                    {entry.label && <span className="account-label">{entry.label}</span>}
                    <span className="token-status valid">
                      {Math.round(entry.cookies_size / 1024)}KB
                    </span>
                  </div>
                  <div className="account-meta">
                    Updated {new Date(entry.updated_at).toLocaleString()}
                  </div>
                </div>
                <div className="account-actions">
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!confirm(`Delete stored cookies for ${entry.domain}?`)) return;
                      try {
                        await deleteBrowserCookies(entry.domain);
                        await load();
                        setCookieMsg(`Cookies for ${entry.domain} deleted`);
                        setTimeout(() => setCookieMsg(null), 3000);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to delete');
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Import Cookies Form */}
        <div className="connect-section">
          {showCookieForm ? (
            <div className="connect-form">
              <div className="form-group">
                <label htmlFor="cookie-domain">Domain</label>
                <input
                  id="cookie-domain"
                  placeholder="linkedin.com"
                  value={cookieDomain}
                  onChange={(e) => setCookieDomain(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cookie-label">Label (optional)</label>
                <input
                  id="cookie-label"
                  placeholder="e.g., LinkedIn personal"
                  value={cookieLabel}
                  onChange={(e) => setCookieLabel(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cookie-json">Cookies JSON</label>
                <textarea
                  id="cookie-json"
                  rows={8}
                  placeholder='Paste exported cookies JSON array here...&#10;[{"name": "li_at", "value": "...", "domain": ".linkedin.com", ...}]'
                  value={cookieJson}
                  onChange={(e) => setCookieJson(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>
              <div className="connect-actions">
                <button
                  className="btn btn-primary"
                  disabled={cookieSaving || !cookieDomain || !cookieJson}
                  onClick={async () => {
                    setCookieSaving(true);
                    try {
                      const parsed = JSON.parse(cookieJson);
                      const result = await storeBrowserCookies({
                        domain: cookieDomain,
                        cookies: parsed,
                        label: cookieLabel || undefined,
                      });
                      setCookieMsg(`Stored ${result.cookie_count} cookies for ${cookieDomain}`);
                      setTimeout(() => setCookieMsg(null), 5000);
                      setShowCookieForm(false);
                      setCookieJson('');
                      setCookieLabel('');
                      await load();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Invalid JSON or save failed');
                    } finally {
                      setCookieSaving(false);
                    }
                  }}
                >
                  {cookieSaving ? 'Saving...' : 'Import Cookies'}
                </button>
                <button className="btn btn-secondary" onClick={() => { setShowCookieForm(false); setCookieJson(''); setCookieLabel(''); }}>
                  Cancel
                </button>
              </div>
              <p className="connect-hint">
                Export cookies from your browser using EditThisCookie or Cookie-Editor extension.
                Filter to the domain (e.g., .linkedin.com) and export as JSON.
                The agent will inject these cookies into the headless browser before navigating.
              </p>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowCookieForm(true)}>
              + Import Browser Cookies
            </button>
          )}
        </div>
      </section>

      {/* Info Section */}
      <section className="settings-section info-section">
        <h3>How Kudjo Uses Google Data</h3>
        <div className="info-grid">
          <div className="info-card">
            <h4>Calendar</h4>
            <p>Reads today's events for morning briefs, creates focus time blocks, and flags meeting conflicts with task deadlines.</p>
          </div>
          <div className="info-card">
            <h4>Tasks</h4>
            <p>Syncs Google Tasks alongside your project tasks for a unified view of everything on your plate.</p>
          </div>
          <div className="info-card">
            <h4>Gmail</h4>
            <p>Searches email (read-only) for meeting context, action items, and follow-ups. Cannot send or modify emails.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
