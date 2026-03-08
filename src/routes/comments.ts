import { Hono } from 'hono';
import type { AppEnv } from '../types';

const comments = new Hono<AppEnv>();

// GET /comments/:taskId - List comments for a task
comments.get('/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');

    // Verify task exists
    const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(taskId).first();
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC',
    ).bind(taskId).all();

    return c.json({ comments: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[comments] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// POST /comments/:taskId - Add a comment to a task
comments.post('/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');

    // Verify task exists
    const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(taskId).first();
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.content || typeof data.content !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'content is required' } }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO task_comments (id, task_id, author, author_name, content, comment_type, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      taskId,
      (data.author ?? 'user').toString(),
      (data.author_name ?? '').toString() || null,
      data.content,
      (data.comment_type ?? 'comment').toString(),
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
    ).run();

    return c.json({ ok: true, id, task_id: taskId }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[comments] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /comments/:taskId/:commentId - Delete a comment
comments.delete('/:taskId/:commentId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const commentId = c.req.param('commentId');

    const existing = await c.env.DB.prepare(
      'SELECT id FROM task_comments WHERE id = ? AND task_id = ?',
    ).bind(commentId, taskId).first();

    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
    }

    await c.env.DB.prepare('DELETE FROM task_comments WHERE id = ?').bind(commentId).run();
    return c.json({ ok: true, id: commentId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[comments] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

export { comments };
