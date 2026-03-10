import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { tasks } from './tasks';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('tasks routes', () => {
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
    app.route('/tasks', tasks);
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /tasks', () => {
    it('creates a task with required fields', async () => {
      const res = await req('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Do the thing' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.id).toBeDefined();

      const rows = mockD1.getAll('tasks');
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Do the thing');
      expect(rows[0].status).toBe('todo');
      expect(rows[0].priority).toBe('medium');
    });

    it('creates a task with project_id and deadline', async () => {
      const res = await req('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Ship feature',
          project_id: 'p1',
          priority: 'high',
          deadline: '2026-04-01',
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('tasks');
      expect(rows[0].project_id).toBe('p1');
      expect(rows[0].deadline).toBe('2026-04-01');
    });

    it('rejects missing title', async () => {
      const res = await req('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'p1' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });
  });

  describe('GET /tasks', () => {
    beforeEach(() => {
      mockD1.seed('tasks', [
        { id: 't1', title: 'Task A', project_id: 'p1', status: 'todo', priority: 'high' },
        { id: 't2', title: 'Task B', project_id: 'p1', status: 'done', priority: 'low' },
        { id: 't3', title: 'Task C', project_id: 'p2', status: 'in_progress', priority: 'medium' },
      ]);
    });

    it('lists all tasks', async () => {
      const res = await req('/tasks');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.tasks).toHaveLength(3);
    });

    it('filters by project_id', async () => {
      const res = await req('/tasks?project_id=p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.tasks).toHaveLength(2);
    });

    it('filters by status', async () => {
      const res = await req('/tasks?status=todo');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].title).toBe('Task A');
    });
  });

  describe('GET /tasks/:id', () => {
    beforeEach(() => {
      mockD1.seed('tasks', [
        { id: 't1', title: 'Task A', status: 'todo' },
      ]);
      mockD1.seed('blockers', []);
    });

    it('returns a task by id', async () => {
      const res = await req('/tasks/t1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.task.title).toBe('Task A');
      expect(body.blockers).toBeDefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/tasks/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /tasks/:id', () => {
    beforeEach(() => {
      mockD1.seed('tasks', [
        { id: 't1', title: 'Old Title', status: 'todo', priority: 'medium' },
      ]);
    });

    it('updates task fields', async () => {
      const res = await req('/tasks/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/tasks/unknown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects empty update', async () => {
      const res = await req('/tasks/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /tasks/:id blocking comments guard', () => {
    beforeEach(() => {
      mockD1.seed('tasks', [
        { id: 't1', title: 'Task with blockers', status: 'in_progress', priority: 'high' },
      ]);
    });

    it('blocks transition to done when unresolved blocking comments exist', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Must fix before closing', comment_type: 'blocking', created_at: '2026-01-01', resolved_at: null },
      ]);
      const res = await req('/tasks/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('BLOCKING_COMMENTS');
      expect(body.error.unresolved_comments).toHaveLength(1);
      expect(body.error.unresolved_comments[0].content).toBe('Must fix before closing');
    });

    it('allows transition to done when all blocking comments are resolved', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Fixed', comment_type: 'blocking', created_at: '2026-01-01', resolved_at: '2026-01-02' },
      ]);
      const res = await req('/tasks/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('allows transition to done when no blocking comments exist', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'user', content: 'Regular comment', comment_type: 'comment', created_at: '2026-01-01', resolved_at: null },
      ]);
      const res = await req('/tasks/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('allows non-done status changes with unresolved blocking comments', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Blocking', comment_type: 'blocking', created_at: '2026-01-01', resolved_at: null },
      ]);
      const res = await req('/tasks/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'blocked' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });
  });

  describe('DELETE /tasks/:id', () => {
    beforeEach(() => {
      mockD1.seed('tasks', [
        { id: 't1', title: 'To Delete', status: 'todo' },
      ]);
    });

    it('deletes a task', async () => {
      const res = await req('/tasks/t1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(mockD1.getAll('tasks')).toHaveLength(0);
    });

    it('returns 404 for unknown id', async () => {
      const res = await req('/tasks/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
