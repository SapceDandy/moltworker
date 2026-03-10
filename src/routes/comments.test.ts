import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { comments } from './comments';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('comments routes', () => {
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
    app.route('/comments', comments);
    env = createMockEnv({ DB: mockD1.db });

    // Seed a task for comment tests
    mockD1.seed('tasks', [
      { id: 't1', title: 'Test task', status: 'todo', priority: 'medium', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);
  });

  describe('GET /comments/:taskId', () => {
    it('returns empty list when no comments exist', async () => {
      const res = await req('/comments/t1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.comments).toEqual([]);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await req('/comments/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns comments for a task in chronological order', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'user', content: 'First comment', comment_type: 'comment', created_at: '2026-01-01T10:00:00Z' },
        { id: 'c2', task_id: 't1', author: 'agent', content: 'Agent reply', comment_type: 'progress_report', created_at: '2026-01-01T11:00:00Z' },
      ]);
      const res = await req('/comments/t1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.comments).toHaveLength(2);
      expect(body.comments[0].id).toBe('c1');
      expect(body.comments[1].author).toBe('agent');
    });
  });

  describe('POST /comments/:taskId', () => {
    it('creates a comment with content', async () => {
      const res = await req('/comments/t1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello world' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.id).toBeDefined();
      expect(body.task_id).toBe('t1');

      const rows = mockD1.getAll('task_comments');
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Hello world');
      expect(rows[0].author).toBe('user');
      expect(rows[0].comment_type).toBe('comment');
    });

    it('creates agent comment with custom fields', async () => {
      const res = await req('/comments/t1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Progress update: 50% complete',
          author: 'agent',
          author_name: 'Kudjo',
          comment_type: 'progress_report',
        }),
      });
      expect(res.status).toBe(201);
      const rows = mockD1.getAll('task_comments');
      expect(rows[0].author).toBe('agent');
      expect(rows[0].author_name).toBe('Kudjo');
      expect(rows[0].comment_type).toBe('progress_report');
    });

    it('returns 404 for non-existent task', async () => {
      const res = await req('/comments/nonexistent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing content', async () => {
      const res = await req('/comments/t1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'user' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await req('/comments/t1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /comments/:taskId/:commentId', () => {
    it('deletes an existing comment', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'user', content: 'To delete', comment_type: 'comment', created_at: '2026-01-01' },
      ]);
      const res = await req('/comments/t1/c1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(mockD1.getAll('task_comments')).toHaveLength(0);
    });

    it('returns 404 for non-existent comment', async () => {
      const res = await req('/comments/t1/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /comments/:taskId?unresolved=true', () => {
    it('returns only unresolved blocking comments', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Regular comment', comment_type: 'comment', created_at: '2026-01-01T10:00:00Z', resolved_at: null },
        { id: 'c2', task_id: 't1', author: 'agent', content: 'Blocking unresolved', comment_type: 'blocking', created_at: '2026-01-01T11:00:00Z', resolved_at: null },
        { id: 'c3', task_id: 't1', author: 'agent', content: 'Blocking resolved', comment_type: 'blocking', created_at: '2026-01-01T12:00:00Z', resolved_at: '2026-01-01T13:00:00Z' },
      ]);
      const res = await req('/comments/t1?unresolved=true');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].id).toBe('c2');
    });

    it('returns all comments when unresolved is not set', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Regular', comment_type: 'comment', created_at: '2026-01-01T10:00:00Z', resolved_at: null },
        { id: 'c2', task_id: 't1', author: 'agent', content: 'Blocking', comment_type: 'blocking', created_at: '2026-01-01T11:00:00Z', resolved_at: null },
      ]);
      const res = await req('/comments/t1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.comments).toHaveLength(2);
    });
  });

  describe('PUT /comments/:taskId/:commentId/resolve', () => {
    it('resolves a blocking comment', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Must fix', comment_type: 'blocking', created_at: '2026-01-01T10:00:00Z', resolved_at: null },
      ]);
      const res = await req('/comments/t1/c1/resolve', { method: 'PUT' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.resolved_at).toBeDefined();

      const rows = mockD1.getAll('task_comments');
      expect(rows[0].resolved_at).toBeDefined();
    });

    it('returns 404 for non-existent comment', async () => {
      const res = await req('/comments/t1/nonexistent/resolve', { method: 'PUT' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for non-blocking comment', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'user', content: 'Regular', comment_type: 'comment', created_at: '2026-01-01', resolved_at: null },
      ]);
      const res = await req('/comments/t1/c1/resolve', { method: 'PUT' });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('NOT_BLOCKING');
    });

    it('returns ok for already resolved comment', async () => {
      mockD1.seed('task_comments', [
        { id: 'c1', task_id: 't1', author: 'agent', content: 'Done', comment_type: 'blocking', created_at: '2026-01-01', resolved_at: '2026-01-02' },
      ]);
      const res = await req('/comments/t1/c1/resolve', { method: 'PUT' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.already_resolved).toBe(true);
    });
  });
});
