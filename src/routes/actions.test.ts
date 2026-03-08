import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { actions } from './actions';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('actions routes', () => {
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
    app.route('/actions', actions);
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /actions', () => {
    it('creates a draft action', async () => {
      const res = await req('/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'email_draft',
          title: 'Follow up with lead',
          content: JSON.stringify({ to: 'test@example.com', subject: 'Hello', body: 'Hi there' }),
          task_id: 'task-1',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.id).toBeTruthy();

      const rows = mockD1.getAll('draft_actions');
      expect(rows).toHaveLength(1);
      expect(rows[0].action_type).toBe('email_draft');
      expect(rows[0].status).toBe('pending');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await req('/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_type: 'email_draft' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid action_type', async () => {
      const res = await req('/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_type: 'invalid', title: 'Test', content: 'Test' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await req('/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /actions', () => {
    it('returns empty list', async () => {
      const res = await req('/actions');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.actions).toEqual([]);
      expect(body.pending_count).toBe(0);
    });

    it('returns seeded actions', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', action_type: 'email_draft', title: 'Email 1', status: 'pending', created_at: '2026-01-01' },
        { id: 'a2', action_type: 'message', title: 'Msg 1', status: 'approved', created_at: '2026-01-02' },
      ]);
      const res = await req('/actions');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.actions).toHaveLength(2);
    });

    it('filters by status', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', status: 'pending', created_at: '2026-01-01' },
        { id: 'a2', status: 'approved', created_at: '2026-01-02' },
      ]);
      const res = await req('/actions?status=pending');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0].id).toBe('a1');
    });

    it('filters by task_id', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', task_id: 't1', status: 'pending', created_at: '2026-01-01' },
        { id: 'a2', task_id: 't2', status: 'pending', created_at: '2026-01-02' },
      ]);
      const res = await req('/actions?task_id=t1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.actions).toHaveLength(1);
    });
  });

  describe('GET /actions/:id', () => {
    it('returns a single action', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', action_type: 'email_draft', title: 'Test', status: 'pending' },
      ]);
      const res = await req('/actions/a1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.action.id).toBe('a1');
    });

    it('returns 404 for non-existent action', async () => {
      const res = await req('/actions/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /actions/:id/approve', () => {
    it('approves a pending action', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', status: 'pending' },
      ]);
      const res = await req('/actions/a1/approve', { method: 'PUT' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.status).toBe('approved');
    });

    it('returns 404 for non-existent action', async () => {
      const res = await req('/actions/nonexistent/approve', { method: 'PUT' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for already approved action', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', status: 'approved' },
      ]);
      const res = await req('/actions/a1/approve', { method: 'PUT' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /actions/:id/reject', () => {
    it('rejects a pending action', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', status: 'pending' },
      ]);
      const res = await req('/actions/a1/reject', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Not appropriate' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.status).toBe('rejected');
    });

    it('returns 404 for non-existent action', async () => {
      const res = await req('/actions/nonexistent/reject', { method: 'PUT' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for already rejected action', async () => {
      mockD1.seed('draft_actions', [
        { id: 'a1', status: 'rejected' },
      ]);
      const res = await req('/actions/a1/reject', { method: 'PUT' });
      expect(res.status).toBe(400);
    });
  });
});
