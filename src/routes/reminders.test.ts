import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { reminders } from './reminders';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('reminders routes', () => {
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
    app.route('/reminders', reminders);
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /reminders', () => {
    it('creates a reminder with required fields', async () => {
      const res = await req('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Follow up with client', remind_at: '2026-03-04T09:00:00Z' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.id).toBeDefined();

      const rows = mockD1.getAll('reminders');
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Follow up with client');
      expect(rows[0].status).toBe('pending');
    });

    it('creates a reminder with all fields', async () => {
      const res = await req('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Weekly standup',
          description: 'Prepare notes',
          remind_at: '2026-03-10T14:00:00Z',
          related_project_id: 'p1',
          related_task_id: 't1',
          recurrence: 'weekly',
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('reminders');
      expect(rows[0].recurrence).toBe('weekly');
      expect(rows[0].related_project_id).toBe('p1');
    });

    it('rejects missing title', async () => {
      const res = await req('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remind_at: '2026-03-04T09:00:00Z' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });

    it('rejects missing remind_at', async () => {
      const res = await req('/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No time' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });
  });

  describe('GET /reminders', () => {
    beforeEach(() => {
      mockD1.seed('reminders', [
        { id: 'r1', title: 'Reminder A', status: 'pending', remind_at: '2026-03-04T09:00:00Z', related_project_id: 'p1' },
        { id: 'r2', title: 'Reminder B', status: 'done', remind_at: '2026-03-03T09:00:00Z', related_project_id: 'p1' },
        { id: 'r3', title: 'Reminder C', status: 'pending', remind_at: '2026-03-05T09:00:00Z', related_project_id: 'p2' },
      ]);
    });

    it('lists all reminders', async () => {
      const res = await req('/reminders');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.reminders).toHaveLength(3);
    });

    it('filters by status', async () => {
      const res = await req('/reminders?status=pending');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.reminders).toHaveLength(2);
    });

    it('filters by project_id', async () => {
      const res = await req('/reminders?project_id=p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.reminders).toHaveLength(2);
    });
  });

  describe('GET /reminders/:id', () => {
    beforeEach(() => {
      mockD1.seed('reminders', [
        { id: 'r1', title: 'Reminder A', status: 'pending', remind_at: '2026-03-04T09:00:00Z' },
      ]);
    });

    it('returns a reminder by id', async () => {
      const res = await req('/reminders/r1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.reminder.title).toBe('Reminder A');
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/reminders/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /reminders/:id', () => {
    beforeEach(() => {
      mockD1.seed('reminders', [
        { id: 'r1', title: 'Old', status: 'pending', remind_at: '2026-03-04T09:00:00Z' },
      ]);
    });

    it('updates reminder fields', async () => {
      const res = await req('/reminders/r1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/reminders/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects empty update', async () => {
      const res = await req('/reminders/r1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /reminders/:id', () => {
    beforeEach(() => {
      mockD1.seed('reminders', [
        { id: 'r1', title: 'To Delete', status: 'pending', remind_at: '2026-03-04T09:00:00Z' },
      ]);
    });

    it('deletes a reminder', async () => {
      const res = await req('/reminders/r1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(mockD1.getAll('reminders')).toHaveLength(0);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/reminders/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
