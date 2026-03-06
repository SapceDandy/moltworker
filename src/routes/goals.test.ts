import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { goals, milestones } from './goals';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.route('/goals', goals);
  app.route('/milestones', milestones);
  return app;
}

describe('goals routes', () => {
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

  describe('POST /goals', () => {
    it('creates a goal with required fields', async () => {
      const res = await req('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Increase revenue' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      const rows = mockD1.getAll('goals');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('active');
    });

    it('creates a goal with metric fields', async () => {
      const res = await req('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Revenue target',
          project_id: 'p1',
          metric: 'revenue',
          target_value: '50000',
          current_value: '12000',
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('goals');
      expect(rows[0].metric).toBe('revenue');
      expect(rows[0].target_value).toBe('50000');
    });

    it('rejects missing title', async () => {
      const res = await req('/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric: 'revenue' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /goals', () => {
    beforeEach(() => {
      mockD1.seed('goals', [
        { id: 'g1', title: 'Goal A', project_id: 'p1', status: 'active' },
        { id: 'g2', title: 'Goal B', project_id: 'p2', status: 'achieved' },
      ]);
    });

    it('lists all goals', async () => {
      const res = await req('/goals');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.goals).toHaveLength(2);
    });

    it('filters by project_id', async () => {
      const res = await req('/goals?project_id=p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.goals).toHaveLength(1);
      expect(body.goals[0].title).toBe('Goal A');
    });

    it('filters by status', async () => {
      const res = await req('/goals?status=achieved');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.goals).toHaveLength(1);
    });
  });

  describe('GET /goals/:id', () => {
    beforeEach(() => {
      mockD1.seed('goals', [{ id: 'g1', title: 'Goal A' }]);
    });

    it('returns a goal by id', async () => {
      const res = await req('/goals/g1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.goal.title).toBe('Goal A');
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/goals/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /goals/:id', () => {
    beforeEach(() => {
      mockD1.seed('goals', [{ id: 'g1', title: 'Old', status: 'active' }]);
    });

    it('updates goal fields', async () => {
      const res = await req('/goals/g1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_value: '25000' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/goals/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'achieved' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /goals/:id', () => {
    beforeEach(() => {
      mockD1.seed('goals', [{ id: 'g1', title: 'To Delete' }]);
    });

    it('deletes a goal', async () => {
      const res = await req('/goals/g1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('goals')).toHaveLength(0);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/goals/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});

describe('milestones routes', () => {
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

  describe('POST /milestones', () => {
    it('creates a milestone with required fields', async () => {
      const res = await req('/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Beta Launch', project_id: 'p1' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      const rows = mockD1.getAll('milestones');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('pending');
    });

    it('rejects missing project_id', async () => {
      const res = await req('/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No Project' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });

    it('rejects missing title', async () => {
      const res = await req('/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'p1' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /milestones', () => {
    beforeEach(() => {
      mockD1.seed('milestones', [
        { id: 'm1', title: 'MS A', project_id: 'p1', sort_order: 1 },
        { id: 'm2', title: 'MS B', project_id: 'p2', sort_order: 0 },
      ]);
    });

    it('lists all milestones', async () => {
      const res = await req('/milestones');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.milestones).toHaveLength(2);
    });

    it('filters by project_id', async () => {
      const res = await req('/milestones?project_id=p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.milestones).toHaveLength(1);
    });
  });

  describe('GET /milestones/:id', () => {
    beforeEach(() => {
      mockD1.seed('milestones', [{ id: 'm1', title: 'MS A' }]);
      mockD1.seed('tasks', []);
    });

    it('returns a milestone by id', async () => {
      const res = await req('/milestones/m1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.milestone.title).toBe('MS A');
      expect(body.task_counts).toBeDefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/milestones/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /milestones/:id', () => {
    beforeEach(() => {
      mockD1.seed('milestones', [{ id: 'm1', title: 'Old', status: 'pending' }]);
    });

    it('updates milestone fields', async () => {
      const res = await req('/milestones/m1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percent_complete: 50 }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/milestones/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /milestones/:id', () => {
    beforeEach(() => {
      mockD1.seed('milestones', [{ id: 'm1', title: 'To Delete' }]);
    });

    it('deletes a milestone', async () => {
      const res = await req('/milestones/m1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('milestones')).toHaveLength(0);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/milestones/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
