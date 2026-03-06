import { Hono } from 'hono';
import type { AppEnv } from '../types';

const reminders = new Hono<AppEnv>();

// GET /reminders - List reminders with optional filters
reminders.get('/', async (c) => {
  try {
    const status = c.req.query('status');
    const projectId = c.req.query('project_id');
    const taskId = c.req.query('task_id');
    const upcoming = c.req.query('upcoming'); // 'true' to get pending reminders due soon
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100);

    let sql = 'SELECT * FROM reminders';
    const params: string[] = [];
    const clauses: string[] = [];

    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (projectId) {
      clauses.push('related_project_id = ?');
      params.push(projectId);
    }
    if (taskId) {
      clauses.push('related_task_id = ?');
      params.push(taskId);
    }
    if (upcoming === 'true') {
      clauses.push("status = 'pending' AND remind_at <= datetime('now', '+24 hours')");
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY remind_at ASC LIMIT ?';
    params.push(limit.toString());

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ reminders: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[reminders] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /reminders/:id - Get a single reminder
reminders.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const reminder = await c.env.DB.prepare('SELECT * FROM reminders WHERE id = ?').bind(id).first();
    if (!reminder) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Reminder not found' } }, 404);
    }
    return c.json({ reminder });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[reminders] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /reminders - Create a reminder
reminders.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.title || typeof data.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'title is required' } }, 400);
    }
    if (!data.remind_at || typeof data.remind_at !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'remind_at is required (ISO datetime or date string)' } }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO reminders (id, title, description, remind_at, status, related_project_id, related_task_id, recurrence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      data.title,
      (data.description ?? '').toString() || null,
      data.remind_at,
      (data.status ?? 'pending').toString(),
      (data.related_project_id ?? '').toString() || null,
      (data.related_task_id ?? '').toString() || null,
      (data.recurrence ?? '').toString() || null,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[reminders] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /reminders/:id - Update a reminder
reminders.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM reminders WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Reminder not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];

    const stringFields = ['title', 'description', 'remind_at', 'status', 'related_project_id', 'related_task_id', 'recurrence'];
    for (const field of stringFields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push((data[field] ?? '').toString() || null);
      }
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }

    params.push(id);

    await c.env.DB.prepare(
      `UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[reminders] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /reminders/:id - Delete a reminder
reminders.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM reminders WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Reminder not found' } }, 404);
    }

    await c.env.DB.prepare('DELETE FROM reminders WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[reminders] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

export { reminders };
