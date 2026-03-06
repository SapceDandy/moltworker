import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { checkins, blockers } from './checkins';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.route('/checkins', checkins);
  app.route('/blockers', blockers);
  return app;
}

describe('checkins routes', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let app: Hono<AppEnv>;
  let env: MoltbotEnv;

  function req(path: string, init?: RequestInit) {
    return app.request(path, init, env);
  }

  beforeEach(() => {
    suppressConsole();
    mockD1 = createMockD1();
    app = createTestApp();
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /checkins', () => {
    it('creates a check-in with required fields', async () => {
      const res = await req('/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkin_type: 'morning_brief', summary: 'Good morning' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      const rows = mockD1.getAll('daily_checkins');
      expect(rows).toHaveLength(1);
      expect(rows[0].checkin_type).toBe('morning_brief');
    });

    it('accepts tasks_planned as JSON array', async () => {
      const res = await req('/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkin_type: 'morning_brief',
          tasks_planned: ['t1', 't2'],
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('daily_checkins');
      expect(rows[0].tasks_planned).toBe('["t1","t2"]');
    });

    it('rejects missing checkin_type', async () => {
      const res = await req('/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'No type' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });
  });

  describe('GET /checkins', () => {
    beforeEach(() => {
      mockD1.seed('daily_checkins', [
        { id: 'c1', checkin_date: '2026-03-03', checkin_type: 'morning_brief', created_at: '2026-03-03T08:00:00Z' },
        { id: 'c2', checkin_date: '2026-03-03', checkin_type: 'evening_recap', created_at: '2026-03-03T17:00:00Z' },
        { id: 'c3', checkin_date: '2026-03-02', checkin_type: 'morning_brief', created_at: '2026-03-02T08:00:00Z' },
      ]);
    });

    it('lists all check-ins', async () => {
      const res = await req('/checkins');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.checkins).toHaveLength(3);
    });

    it('filters by date', async () => {
      const res = await req('/checkins?date=2026-03-03');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.checkins).toHaveLength(2);
    });

    it('filters by type', async () => {
      const res = await req('/checkins?type=morning_brief');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.checkins).toHaveLength(2);
    });
  });
});

describe('blockers routes', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let app: Hono<AppEnv>;
  let env: MoltbotEnv;

  function req(path: string, init?: RequestInit) {
    return app.request(path, init, env);
  }

  beforeEach(() => {
    suppressConsole();
    mockD1 = createMockD1();
    app = createTestApp();
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /blockers', () => {
    it('creates a blocker with required fields', async () => {
      const res = await req('/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Waiting on API key' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      const rows = mockD1.getAll('blockers');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('open');
      expect(rows[0].severity).toBe('medium');
    });

    it('creates a blocker with project and task references', async () => {
      const res = await req('/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Need design review',
          project_id: 'p1',
          task_id: 't1',
          severity: 'high',
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('blockers');
      expect(rows[0].severity).toBe('high');
      expect(rows[0].project_id).toBe('p1');
    });

    it('rejects missing description', async () => {
      const res = await req('/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: 'high' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /blockers', () => {
    beforeEach(() => {
      mockD1.seed('blockers', [
        { id: 'b1', description: 'Blocker A', status: 'open', severity: 'high', project_id: 'p1' },
        { id: 'b2', description: 'Blocker B', status: 'resolved', severity: 'low', project_id: 'p1' },
        { id: 'b3', description: 'Blocker C', status: 'open', severity: 'medium', project_id: 'p2' },
      ]);
    });

    it('lists all blockers', async () => {
      const res = await req('/blockers');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.blockers).toHaveLength(3);
    });

    it('filters by status', async () => {
      const res = await req('/blockers?status=open');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.blockers).toHaveLength(2);
    });

    it('filters by project_id', async () => {
      const res = await req('/blockers?project_id=p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.blockers).toHaveLength(2);
    });
  });

  describe('PUT /blockers/:id', () => {
    beforeEach(() => {
      mockD1.seed('blockers', [
        { id: 'b1', description: 'Blocker A', status: 'open', severity: 'high' },
      ]);
    });

    it('resolves a blocker', async () => {
      const res = await req('/blockers/b1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolution: 'Got the key' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/blockers/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      expect(res.status).toBe(404);
    });
  });
});
