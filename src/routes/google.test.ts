import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { google } from './google';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

const TEST_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('google routes', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let app: Hono<AppEnv>;
  let env: MoltbotEnv;

  function req(path: string, init?: RequestInit) {
    return app.request(path, init, env);
  }

  beforeEach(() => {
    suppressConsole();
    mockD1 = createMockD1();
    app = new Hono<AppEnv>();
    app.route('/google', google);
    env = createMockEnv({
      DB: mockD1.db,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      TOKEN_ENCRYPTION_KEY: TEST_KEY,
      WORKER_URL: 'https://test.example.com',
    });
  });

  describe('GET /google/auth', () => {
    it('redirects to Google consent screen', async () => {
      const res = await req('/google/auth');
      expect(res.status).toBe(302);
      const location = res.headers.get('Location') || '';
      expect(location).toContain('accounts.google.com');
      expect(location).toContain('client_id=test-client-id');
      expect(location).toContain('redirect_uri=');
      expect(location).toContain('calendar');
      expect(location).toContain('tasks');
      expect(location).toContain('gmail');
    });

    it('includes label in state param', async () => {
      const res = await req('/google/auth?label=work');
      expect(res.status).toBe(302);
      const location = res.headers.get('Location') || '';
      expect(location).toContain('state=');
      // State should contain the label
      const stateMatch = location.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      const state = JSON.parse(decodeURIComponent(stateMatch![1]));
      expect(state.label).toBe('work');
    });

    it('returns 400 if Google not configured', async () => {
      env = createMockEnv({ DB: mockD1.db });
      const res = await req('/google/auth');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('not configured');
    });
  });

  describe('GET /google/callback', () => {
    it('redirects with error if error param present', async () => {
      const res = await req('/google/callback?error=access_denied');
      expect(res.status).toBe(302);
      const location = res.headers.get('Location') || '';
      expect(location).toContain('error=access_denied');
    });

    it('redirects with error if no code', async () => {
      const res = await req('/google/callback');
      expect(res.status).toBe(302);
      const location = res.headers.get('Location') || '';
      expect(location).toContain('error=no_code');
    });
  });

  describe('GET /google/accounts', () => {
    it('returns empty list when no accounts connected', async () => {
      const res = await req('/google/accounts');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.accounts).toEqual([]);
    });

    it('returns connected accounts', async () => {
      const now = new Date().toISOString();
      const futureExpiry = new Date(Date.now() + 3600000).toISOString();
      mockD1.seed('integrations', [{
        id: 'int-1',
        provider: 'google',
        account_email: 'test@gmail.com',
        account_label: 'personal',
        access_token_enc: 'encrypted-token',
        refresh_token_enc: 'encrypted-refresh',
        token_expiry: futureExpiry,
        scopes: 'https://www.googleapis.com/auth/calendar',
        created_at: now,
        updated_at: now,
      }]);

      const res = await req('/google/accounts');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.accounts).toHaveLength(1);
      expect(body.accounts[0].email).toBe('test@gmail.com');
      expect(body.accounts[0].label).toBe('personal');
      expect(body.accounts[0].token_valid).toBe(true);
    });

    it('reports expired tokens', async () => {
      const now = new Date().toISOString();
      const pastExpiry = new Date(Date.now() - 3600000).toISOString();
      mockD1.seed('integrations', [{
        id: 'int-1',
        provider: 'google',
        account_email: 'test@gmail.com',
        account_label: null,
        access_token_enc: 'encrypted-token',
        refresh_token_enc: null,
        token_expiry: pastExpiry,
        scopes: 'calendar tasks',
        created_at: now,
        updated_at: now,
      }]);

      const res = await req('/google/accounts');
      const body = (await res.json()) as any;
      expect(body.accounts[0].token_valid).toBe(false);
    });
  });

  describe('DELETE /google/accounts/:id', () => {
    it('deletes a connected account', async () => {
      const now = new Date().toISOString();
      mockD1.seed('integrations', [{
        id: 'int-del',
        provider: 'google',
        account_email: 'del@gmail.com',
        account_label: null,
        access_token_enc: 'enc',
        refresh_token_enc: null,
        token_expiry: now,
        scopes: 'calendar',
        created_at: now,
        updated_at: now,
      }]);

      const res = await req('/google/accounts/int-del', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);

      const rows = mockD1.getAll('integrations');
      expect(rows).toHaveLength(0);
    });

    it('returns 404 for non-existent account', async () => {
      const res = await req('/google/accounts/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /google/calendar/events', () => {
    it('returns empty when no accounts connected', async () => {
      const res = await req('/google/calendar/events?date=2025-03-05');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.events).toEqual([]);
      expect(body.message).toContain('No Google accounts');
    });

    it('returns 400 when Google not configured', async () => {
      env = createMockEnv({ DB: mockD1.db });
      const res = await req('/google/calendar/events');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /google/calendar/events', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'Test Event' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('GET /google/tasks', () => {
    it('returns empty when no accounts connected', async () => {
      const res = await req('/google/tasks');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.tasks).toEqual([]);
    });
  });

  describe('GET /google/gmail/threads', () => {
    it('returns empty when no accounts connected', async () => {
      const res = await req('/google/gmail/threads');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.threads).toEqual([]);
    });
  });

  describe('GET /google/gmail/threads/:id', () => {
    it('returns 400 when no account connected', async () => {
      const res = await req('/google/gmail/threads/thread-123');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  // ============================================================
  // Google Drive
  // ============================================================

  describe('GET /google/drive/files', () => {
    it('returns empty when no accounts connected', async () => {
      const res = await req('/google/drive/files');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.files).toEqual([]);
      expect(body.message).toContain('No Google account');
    });

    it('returns 400 when Google not configured', async () => {
      env = createMockEnv({ DB: mockD1.db });
      const res = await req('/google/drive/files');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /google/drive/files/:id', () => {
    it('returns 400 when no account connected', async () => {
      const res = await req('/google/drive/files/file-123');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('GET /google/drive/files/:id/content', () => {
    it('returns 400 when no account connected', async () => {
      const res = await req('/google/drive/files/file-123/content');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('POST /google/drive/files', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/drive/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/drive/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test File' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  // ============================================================
  // Google Sheets
  // ============================================================

  describe('GET /google/sheets/:id', () => {
    it('returns 400 when no account connected', async () => {
      const res = await req('/google/sheets/spreadsheet-123');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('PUT /google/sheets/:id', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/sheets/spreadsheet-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when range or values missing', async () => {
      const res = await req('/google/sheets/spreadsheet-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: '', values: [] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/sheets/spreadsheet-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: 'Sheet1!A1:B2', values: [['a', 'b']] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('POST /google/sheets', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Sheet' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  // ============================================================
  // Google Docs
  // ============================================================

  describe('GET /google/docs/:id', () => {
    it('returns 400 when no account connected', async () => {
      const res = await req('/google/docs/doc-123');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('POST /google/docs', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Doc' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('PATCH /google/docs/:id', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/docs/doc-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when requests array is empty', async () => {
      const res = await req('/google/docs/doc-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/docs/doc-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: 'hello' } }] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  // ============================================================
  // Google Slides API
  // ============================================================

  describe('GET /google/slides/:id', () => {
    it('returns 400 when no account connected', async () => {
      const res = await req('/google/slides/pres-123');
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('POST /google/slides', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Deck' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });

  describe('PATCH /google/slides/:id', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await req('/google/slides/pres-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when requests array is empty', async () => {
      const res = await req('/google/slides/pres-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });

    it('returns 400 when no account connected', async () => {
      const res = await req('/google/slides/pres-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ createSlide: { objectId: 's1', insertionIndex: 1 } }] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NO_ACCOUNT');
    });
  });
});
