import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { projects } from './projects';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('projects routes', () => {
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
    app.route('/projects', projects);
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /projects', () => {
    it('creates a project with required fields', async () => {
      const res = await req('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Project' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.id).toBeDefined();

      const rows = mockD1.getAll('projects');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Test Project');
      expect(rows[0].status).toBe('active');
      expect(rows[0].priority).toBe('medium');
    });

    it('creates a project with all fields', async () => {
      const res = await req('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Full Project',
          description: 'A detailed project',
          status: 'active',
          priority: 'high',
          health: 'at_risk',
          percent_complete: 25,
          start_date: '2026-01-01',
          target_date: '2026-06-01',
          notes: 'Some notes',
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('projects');
      expect(rows[0].priority).toBe('high');
      expect(rows[0].health).toBe('at_risk');
      expect(rows[0].percent_complete).toBe(25);
    });

    it('rejects missing name', async () => {
      const res = await req('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'No name' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });

    it('rejects invalid JSON', async () => {
      const res = await req('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('GET /projects', () => {
    beforeEach(() => {
      mockD1.seed('projects', [
        { id: 'p1', name: 'Project A', status: 'active', priority: 'high', updated_at: '2026-01-01' },
        { id: 'p2', name: 'Project B', status: 'completed', priority: 'low', updated_at: '2026-01-02' },
        { id: 'p3', name: 'Project C', status: 'active', priority: 'medium', updated_at: '2026-01-03' },
      ]);
    });

    it('lists all projects', async () => {
      const res = await req('/projects');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.projects).toHaveLength(3);
    });

    it('filters by status', async () => {
      const res = await req('/projects?status=active');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.projects).toHaveLength(2);
      expect(body.projects.every((p: any) => p.status === 'active')).toBe(true);
    });

    it('filters by priority', async () => {
      const res = await req('/projects?priority=high');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].name).toBe('Project A');
    });
  });

  describe('GET /projects/:id', () => {
    beforeEach(() => {
      mockD1.seed('projects', [
        { id: 'p1', name: 'Project A', status: 'active', priority: 'high' },
      ]);
      mockD1.seed('tasks', []);
      mockD1.seed('blockers', []);
      mockD1.seed('milestones', []);
    });

    it('returns a project by id', async () => {
      const res = await req('/projects/p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.project.name).toBe('Project A');
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/projects/unknown');
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /projects/:id', () => {
    beforeEach(() => {
      mockD1.seed('projects', [
        { id: 'p1', name: 'Old Name', status: 'active', priority: 'medium' },
      ]);
    });

    it('updates project fields', async () => {
      const res = await req('/projects/p1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name', priority: 'high' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/projects/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects empty update', async () => {
      const res = await req('/projects/p1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });
  });

  describe('DELETE /projects/:id', () => {
    beforeEach(() => {
      mockD1.seed('projects', [
        { id: 'p1', name: 'To Delete', status: 'active', priority: 'medium' },
      ]);
    });

    it('deletes a project', async () => {
      const res = await req('/projects/p1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(mockD1.getAll('projects')).toHaveLength(0);
    });

    it('unlinks tasks/goals and deletes milestones/blockers/snapshots on delete', async () => {
      mockD1.seed('tasks', [
        { id: 't1', title: 'Linked task', project_id: 'p1', milestone_id: 'm1', status: 'todo', priority: 'medium' },
        { id: 't2', title: 'Other project task', project_id: 'p2', milestone_id: 'm1', status: 'todo', priority: 'medium' },
      ]);
      mockD1.seed('goals', [
        { id: 'g1', title: 'Linked goal', project_id: 'p1' },
      ]);
      mockD1.seed('milestones', [
        { id: 'm1', title: 'Linked milestone', project_id: 'p1', status: 'pending', percent_complete: 0, sort_order: 0 },
      ]);
      mockD1.seed('blockers', [
        { id: 'b1', project_id: 'p1', description: 'Stuck', status: 'open', severity: 'medium' },
      ]);
      mockD1.seed('progress_snapshots', [
        { id: 's1', project_id: 'p1', snapshot_date: '2026-03-30' },
      ]);

      const res = await req('/projects/p1', { method: 'DELETE' });
      expect(res.status).toBe(200);

      // Project deleted
      expect(mockD1.getAll('projects')).toHaveLength(0);
      // Tasks unlinked (still exist, project_id nulled on p1's task, milestone_id nulled on both)
      const tasks = mockD1.getAll('tasks');
      expect(tasks).toHaveLength(2);
      const t1 = tasks.find((t: any) => t.id === 't1') as any;
      const t2 = tasks.find((t: any) => t.id === 't2') as any;
      expect(t1.project_id).toBeNull();
      expect(t1.milestone_id).toBeNull();
      expect(t2.project_id).toBe('p2'); // other project untouched
      expect(t2.milestone_id).toBeNull(); // but milestone_id nulled because m1 was deleted
      // Goal unlinked
      const goals = mockD1.getAll('goals');
      expect(goals).toHaveLength(1);
      expect(goals[0].project_id).toBeNull();
      // Milestones deleted (project_id is NOT NULL so can't unlink)
      expect(mockD1.getAll('milestones')).toHaveLength(0);
      // Blockers deleted
      expect(mockD1.getAll('blockers')).toHaveLength(0);
      // Snapshots deleted
      expect(mockD1.getAll('progress_snapshots')).toHaveLength(0);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/projects/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
