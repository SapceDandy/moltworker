import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { encrypt, decrypt } from '../lib/crypto';

const google = new Hono<AppEnv>();

// Google OAuth2 scopes
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function getRedirectUri(env: { WORKER_URL?: string }): string {
  const base = env.WORKER_URL || 'http://localhost:8787';
  return `${base}/api/google/callback`;
}

function requireGoogleConfig(c: { env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; TOKEN_ENCRYPTION_KEY?: string } }) {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return { error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not configured' };
  }
  if (!c.env.TOKEN_ENCRYPTION_KEY) {
    return { error: 'TOKEN_ENCRYPTION_KEY not configured' };
  }
  return null;
}

// ============================================================
// Token refresh helper
// ============================================================

async function refreshAccessToken(
  refreshTokenEnc: string,
  env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; TOKEN_ENCRYPTION_KEY?: string },
): Promise<{ access_token: string; expires_in: number } | null> {
  if (!refreshTokenEnc || !env.TOKEN_ENCRYPTION_KEY) return null;

  const refreshToken = await decrypt(refreshTokenEnc, env.TOKEN_ENCRYPTION_KEY);

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) return null;
  return resp.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function getValidAccessToken(
  integration: Record<string, unknown>,
  env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; TOKEN_ENCRYPTION_KEY?: string; DB: D1Database },
): Promise<string | null> {
  const expiry = integration.token_expiry as string | null;
  const now = new Date().toISOString();

  // If token is still valid, decrypt and return it
  if (expiry && expiry > now) {
    return decrypt(integration.access_token_enc as string, env.TOKEN_ENCRYPTION_KEY!);
  }

  // Try to refresh
  const refreshEnc = integration.refresh_token_enc as string | null;
  if (!refreshEnc) return null;

  const refreshed = await refreshAccessToken(refreshEnc, env);
  if (!refreshed) return null;

  // Encrypt and store the new access token
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const newAccessEnc = await encrypt(refreshed.access_token, env.TOKEN_ENCRYPTION_KEY!);

  await env.DB.prepare(
    'UPDATE integrations SET access_token_enc = ?, token_expiry = ?, updated_at = ? WHERE id = ?',
  )
    .bind(newAccessEnc, newExpiry, now, integration.id)
    .run();

  return refreshed.access_token;
}

// Helper to get integration by ID or first google account
async function getIntegration(
  db: D1Database,
  accountId?: string,
): Promise<Record<string, unknown> | null> {
  if (accountId) {
    return db
      .prepare('SELECT * FROM integrations WHERE id = ? AND provider = ?')
      .bind(accountId, 'google')
      .first();
  }
  return db
    .prepare("SELECT * FROM integrations WHERE provider = 'google' ORDER BY created_at ASC LIMIT 1")
    .first();
}

// ============================================================
// OAuth2 Flow
// ============================================================

// GET /google/auth - Redirect to Google consent screen
google.get('/auth', (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const label = c.req.query('label') || '';
  const state = JSON.stringify({ label, ts: Date.now() });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(c.env),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// GET /google/callback - Exchange code for tokens
google.get('/callback', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const code = c.req.query('code');
  const stateRaw = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/_admin/#/settings?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return c.redirect('/_admin/#/settings?error=no_code');
  }

  let label = '';
  try {
    const state = JSON.parse(stateRaw || '{}');
    label = state.label || '';
  } catch {
    // ignore
  }

  try {
    // Exchange code for tokens
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: getRedirectUri(c.env),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error('[google] Token exchange failed:', errBody);
      return c.redirect('/_admin/#/settings?error=token_exchange_failed');
    }

    const tokens = (await tokenResp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    // Get user info for email
    const userResp = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    let email = '';
    if (userResp.ok) {
      const userInfo = (await userResp.json()) as { email?: string };
      email = userInfo.email || '';
    }

    // Encrypt tokens
    const encKey = c.env.TOKEN_ENCRYPTION_KEY!;
    const accessEnc = await encrypt(tokens.access_token, encKey);
    const refreshEnc = tokens.refresh_token
      ? await encrypt(tokens.refresh_token, encKey)
      : null;
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // Check if this email is already connected
    const existing = await c.env.DB.prepare(
      "SELECT id FROM integrations WHERE provider = 'google' AND account_email = ?",
    )
      .bind(email)
      .first();

    if (existing) {
      // Update existing integration
      await c.env.DB.prepare(
        `UPDATE integrations SET access_token_enc = ?, refresh_token_enc = COALESCE(?, refresh_token_enc),
         token_expiry = ?, scopes = ?, account_label = COALESCE(?, account_label), updated_at = ? WHERE id = ?`,
      )
        .bind(accessEnc, refreshEnc, expiry, tokens.scope, label || null, now, existing.id)
        .run();
    } else {
      // Insert new integration
      await c.env.DB.prepare(
        `INSERT INTO integrations (id, provider, account_email, account_label, access_token_enc, refresh_token_enc, token_expiry, scopes, created_at, updated_at)
         VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, email, label || null, accessEnc, refreshEnc, expiry, tokens.scope, now, now)
        .run();
    }

    return c.redirect('/_admin/#/settings?success=connected');
  } catch (err) {
    console.error('[google] Callback error:', err);
    return c.redirect('/_admin/#/settings?error=callback_failed');
  }
});

// GET /google/accounts - List connected Google accounts
google.get('/accounts', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT id, provider, account_email, account_label, scopes, token_expiry, created_at, updated_at FROM integrations WHERE provider = 'google' ORDER BY created_at ASC",
    ).all();

    const accounts = (results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      email: r.account_email,
      label: r.account_label,
      scopes: r.scopes,
      token_valid: r.token_expiry ? (r.token_expiry as string) > new Date().toISOString() : false,
      created_at: r.created_at,
    }));

    return c.json({ accounts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// DELETE /google/accounts/:id - Disconnect a Google account
google.delete('/accounts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare(
      "SELECT id FROM integrations WHERE id = ? AND provider = 'google'",
    )
      .bind(id)
      .first();

    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404);
    }

    await c.env.DB.prepare('DELETE FROM integrations WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Google Calendar API Proxy
// ============================================================

// GET /google/calendar/events - Fetch calendar events
google.get('/calendar/events', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const accountId = c.req.query('account_id');

  try {
    // If account_id specified, fetch from that account; otherwise fetch from all
    let integrations: Record<string, unknown>[];
    if (accountId) {
      const single = await getIntegration(c.env.DB, accountId);
      integrations = single ? [single] : [];
    } else {
      const { results } = await c.env.DB.prepare(
        "SELECT * FROM integrations WHERE provider = 'google'",
      ).all();
      integrations = (results ?? []) as Record<string, unknown>[];
    }

    if (integrations.length === 0) {
      return c.json({ events: [], message: 'No Google accounts connected' });
    }

    const allEvents: Array<Record<string, unknown>> = [];

    for (const integration of integrations) {
      const token = await getValidAccessToken(integration, c.env);
      if (!token) continue;

      const timeMin = `${date}T00:00:00Z`;
      const timeMax = `${date}T23:59:59Z`;
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
      });

      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (resp.ok) {
        const data = (await resp.json()) as { items?: Array<Record<string, unknown>> };
        for (const item of data.items ?? []) {
          allEvents.push({
            ...item,
            _account_id: integration.id,
            _account_email: integration.account_email,
            _account_label: integration.account_label,
          });
        }
      }
    }

    return c.json({ events: allEvents, date });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'CALENDAR_FETCH_FAILED', message: msg } }, 500);
  }
});

// POST /google/calendar/events - Create a calendar event
google.post('/calendar/events', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const accountId = (data.account_id as string) || undefined;

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    // Forward event data to Google Calendar API
    const eventData = { ...data };
    delete eventData.account_id;

    const resp = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const event = await resp.json();
    return c.json({ ok: true, event }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'CREATE_EVENT_FAILED', message: msg } }, 500);
  }
});

// PUT /google/calendar/events/:eventId - Update a calendar event
google.put('/calendar/events/:eventId', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const eventId = c.req.param('eventId');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const accountId = (data.account_id as string) || undefined;

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const eventData = { ...data };
    delete eventData.account_id;

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const event = await resp.json();
    return c.json({ ok: true, event });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'UPDATE_EVENT_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Google Tasks API Proxy
// ============================================================

// GET /google/tasks - List tasks from Google Tasks
google.get('/tasks', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ tasks: [], message: 'No Google account connected' });
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    // First get task lists
    const listsResp = await fetch(
      'https://www.googleapis.com/tasks/v1/users/@me/lists',
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!listsResp.ok) {
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: 'Failed to fetch task lists' } }, 500);
    }

    const listsData = (await listsResp.json()) as { items?: Array<{ id: string; title: string }> };
    const allTasks: Array<Record<string, unknown>> = [];

    // Fetch tasks from each list
    for (const list of listsData.items ?? []) {
      const tasksResp = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&maxResults=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (tasksResp.ok) {
        const tasksData = (await tasksResp.json()) as { items?: Array<Record<string, unknown>> };
        for (const task of tasksData.items ?? []) {
          allTasks.push({
            ...task,
            _list_id: list.id,
            _list_title: list.title,
            _account_id: integration.id,
            _account_email: integration.account_email,
          });
        }
      }
    }

    return c.json({ tasks: allTasks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'TASKS_FETCH_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Gmail API Proxy (Read-Only)
// ============================================================

// GET /google/gmail/threads - Search email threads
google.get('/gmail/threads', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const q = c.req.query('q') || '';
  const accountId = c.req.query('account_id');
  const maxResults = Math.min(Number(c.req.query('max_results')) || 10, 50);

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ threads: [], message: 'No Google account connected' });
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
    });
    if (q) params.set('q', q);

    const resp = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, 500);
    }

    const data = (await resp.json()) as { threads?: Array<{ id: string; snippet: string; historyId: string }> };
    return c.json({
      threads: data.threads ?? [],
      _account_id: integration.id,
      _account_email: integration.account_email,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'GMAIL_FETCH_FAILED', message: msg } }, 500);
  }
});

// GET /google/gmail/threads/:id - Get a specific thread
google.get('/gmail/threads/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const threadId = c.req.param('id');
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const thread = await resp.json();
    return c.json({ thread });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'GMAIL_THREAD_FAILED', message: msg } }, 500);
  }
});

// POST /google/gmail/send - Send an email via Gmail
google.post('/gmail/send', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const to = (data.to as string) || '';
  const subject = (data.subject as string) || '';
  const bodyText = (data.body as string) || (data.html as string) || '';
  const cc = (data.cc as string) || '';
  const bcc = (data.bcc as string) || '';
  const accountId = (data.account_id as string) || undefined;
  const isHtml = !!(data.html as string);

  if (!to || !subject) {
    return c.json({ error: { code: 'VALIDATION', message: 'to and subject are required' } }, 400);
  }

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    // Check if gmail.send scope is authorized
    const scopes = (integration.scopes as string) || '';
    if (!scopes.includes('gmail.send')) {
      return c.json({
        error: {
          code: 'MISSING_SCOPE',
          message: 'Gmail send scope not authorized. Please re-connect your Google account to grant send permission.',
        },
      }, 403);
    }

    // Build RFC 2822 email message
    const fromEmail = (integration.account_email as string) || '';
    let rawMessage = `From: ${fromEmail}\r\nTo: ${to}\r\nSubject: ${subject}\r\n`;
    if (cc) rawMessage += `Cc: ${cc}\r\n`;
    if (bcc) rawMessage += `Bcc: ${bcc}\r\n`;
    rawMessage += `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8\r\n`;
    rawMessage += `\r\n${bodyText}`;

    // Base64url encode
    const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const resp = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('[gmail] Send failed:', errBody);
      return c.json({ error: { code: 'GMAIL_SEND_FAILED', message: errBody } }, resp.status as 400);
    }

    const result = await resp.json();
    return c.json({ ok: true, message_id: (result as Record<string, unknown>).id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[gmail] Send error:', msg);
    return c.json({ error: { code: 'GMAIL_SEND_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Google Drive API Proxy
// ============================================================

// GET /google/drive/files - List/search files
google.get('/drive/files', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const q = c.req.query('q') || '';
  const pageSize = Math.min(Number(c.req.query('pageSize')) || 20, 100);
  const pageToken = c.req.query('pageToken') || '';
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ files: [], message: 'No Google account connected' });
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const params = new URLSearchParams({
      pageSize: pageSize.toString(),
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink)',
    });
    if (q) params.set('q', q);
    if (pageToken) params.set('pageToken', pageToken);

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const data = (await resp.json()) as { files?: unknown[]; nextPageToken?: string };
    return c.json({
      files: data.files ?? [],
      nextPageToken: data.nextPageToken,
      _account_id: integration.id,
      _account_email: integration.account_email,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DRIVE_LIST_FAILED', message: msg } }, 500);
  }
});

// GET /google/drive/files/:id - Get file metadata
google.get('/drive/files/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const fileId = c.req.param('id');
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const fields = 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,description';
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const file = await resp.json();
    return c.json({ file });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DRIVE_GET_FAILED', message: msg } }, 500);
  }
});

// GET /google/drive/files/:id/content - Download/export file content
google.get('/drive/files/:id/content', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const fileId = c.req.param('id');
  const exportMimeType = c.req.query('exportMimeType') || 'text/plain';
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    // First get the file metadata to check mimeType
    const metaResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!metaResp.ok) {
      const errBody = await metaResp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, metaResp.status as 400);
    }

    const meta = (await metaResp.json()) as { mimeType: string; name: string };
    const isGoogleNative = meta.mimeType.startsWith('application/vnd.google-apps.');

    let contentResp: Response;
    if (isGoogleNative) {
      // Export Google-native files (Docs, Sheets, Slides)
      contentResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } else {
      // Download binary/text files directly
      contentResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }

    if (!contentResp.ok) {
      const errBody = await contentResp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, contentResp.status as 400);
    }

    const content = await contentResp.text();
    return c.json({ name: meta.name, mimeType: meta.mimeType, exportedAs: isGoogleNative ? exportMimeType : meta.mimeType, content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DRIVE_CONTENT_FAILED', message: msg } }, 500);
  }
});

// POST /google/drive/files - Create a file
google.post('/drive/files', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const name = (data.name as string) || 'Untitled';
  const mimeType = (data.mimeType as string) || 'application/vnd.google-apps.document';
  const parents = (data.parents as string[]) || undefined;
  const content = (data.content as string) || undefined;
  const accountId = (data.account_id as string) || undefined;

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const metadata: Record<string, unknown> = { name, mimeType };
    if (parents) metadata.parents = parents;

    let resp: Response;
    if (content) {
      // Multipart upload with content
      const boundary = '---boundary' + Date.now();
      const multipartBody = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${mimeType.startsWith('application/vnd.google-apps.') ? 'text/plain' : mimeType}`,
        '',
        content,
        `--${boundary}--`,
      ].join('\r\n');

      resp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        },
      );
    } else {
      // Metadata-only creation
      resp = await fetch(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadata),
        },
      );
    }

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const file = await resp.json();
    return c.json({ ok: true, file }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DRIVE_CREATE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Google Sheets API Proxy
// ============================================================

// GET /google/sheets/:id - Read spreadsheet data
google.get('/sheets/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const spreadsheetId = c.req.param('id');
  const range = c.req.query('range') || '';
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    if (range) {
      // Get values for a specific range
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
      }

      const data = await resp.json();
      return c.json({ spreadsheetId, ...data as Record<string, unknown> });
    } else {
      // Get spreadsheet metadata (sheets list, title, etc.)
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
      }

      const data = await resp.json();
      return c.json(data as Record<string, unknown>);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'SHEETS_READ_FAILED', message: msg } }, 500);
  }
});

// PUT /google/sheets/:id - Write values to a range
google.put('/sheets/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const spreadsheetId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const range = (data.range as string) || '';
  const values = (data.values as unknown[][]) || [];
  const accountId = (data.account_id as string) || undefined;

  if (!range || values.length === 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'range and values are required' } }, 400);
  }

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ range, values }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const result = await resp.json();
    return c.json({ ok: true, ...result as Record<string, unknown> });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'SHEETS_WRITE_FAILED', message: msg } }, 500);
  }
});

// POST /google/sheets - Create a new spreadsheet
google.post('/sheets', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const title = (data.title as string) || 'Untitled Spreadsheet';
  const sheetNames = (data.sheets as string[]) || ['Sheet1'];
  const accountId = (data.account_id as string) || undefined;

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title },
          sheets: sheetNames.map((name) => ({
            properties: { title: name },
          })),
        }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const result = (await resp.json()) as Record<string, unknown>;
    return c.json({
      ok: true,
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
      title,
    }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'SHEETS_CREATE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Google Docs API Proxy
// ============================================================

// GET /google/docs/:id - Get document content
google.get('/docs/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const documentId = c.req.param('id');
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const doc = (await resp.json()) as Record<string, unknown>;
    return c.json({
      documentId: doc.documentId,
      title: doc.title,
      body: doc.body,
      revisionId: doc.revisionId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DOCS_GET_FAILED', message: msg } }, 500);
  }
});

// POST /google/docs - Create a new document
google.post('/docs', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const title = (data.title as string) || 'Untitled Document';
  const accountId = (data.account_id as string) || undefined;

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      'https://docs.googleapis.com/v1/documents',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const doc = (await resp.json()) as Record<string, unknown>;
    return c.json({
      ok: true,
      documentId: doc.documentId,
      title: doc.title,
      revisionId: doc.revisionId,
    }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DOCS_CREATE_FAILED', message: msg } }, 500);
  }
});

// PATCH /google/docs/:id - Batch update document
google.patch('/docs/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const documentId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const requests = (data.requests as unknown[]) || [];
  const accountId = (data.account_id as string) || undefined;

  if (requests.length === 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'requests array is required and must not be empty' } }, 400);
  }

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const result = await resp.json();
    return c.json({ ok: true, ...result as Record<string, unknown> });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'DOCS_UPDATE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// Google Slides API Proxy
// ============================================================

// GET /google/slides/:id - Get presentation content
google.get('/slides/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const presentationId = c.req.param('id');
  const accountId = c.req.query('account_id');

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const pres = (await resp.json()) as Record<string, unknown>;
    return c.json({
      presentationId: pres.presentationId,
      title: pres.title,
      slides: pres.slides,
      slideProperties: pres.slideProperties,
      pageSize: pres.pageSize,
      locale: pres.locale,
      revisionId: pres.revisionId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'SLIDES_GET_FAILED', message: msg } }, 500);
  }
});

// POST /google/slides - Create a new presentation
google.post('/slides', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const title = (data.title as string) || 'Untitled Presentation';
  const accountId = (data.account_id as string) || undefined;

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      'https://slides.googleapis.com/v1/presentations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const pres = (await resp.json()) as Record<string, unknown>;
    return c.json({
      ok: true,
      presentationId: pres.presentationId,
      title: pres.title,
      revisionId: pres.revisionId,
    }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'SLIDES_CREATE_FAILED', message: msg } }, 500);
  }
});

// PATCH /google/slides/:id - Batch update presentation
google.patch('/slides/:id', async (c) => {
  const configErr = requireGoogleConfig(c);
  if (configErr) return c.json({ error: configErr.error }, 400);

  const presentationId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
  }

  const data = body as Record<string, unknown>;
  const requests = (data.requests as unknown[]) || [];
  const accountId = (data.account_id as string) || undefined;

  if (requests.length === 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'requests array is required and must not be empty' } }, 400);
  }

  try {
    const integration = await getIntegration(c.env.DB, accountId);
    if (!integration) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No Google account connected' } }, 400);
    }

    const token = await getValidAccessToken(integration, c.env);
    if (!token) {
      return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'Could not get valid access token' } }, 401);
    }

    const resp = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return c.json({ error: { code: 'GOOGLE_API_ERROR', message: errBody } }, resp.status as 400);
    }

    const result = await resp.json();
    return c.json({ ok: true, ...result as Record<string, unknown> });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'SLIDES_UPDATE_FAILED', message: msg } }, 500);
  }
});

export { google };
