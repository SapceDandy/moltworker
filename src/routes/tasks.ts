import { Hono } from 'hono';
import type { AppEnv } from '../types';

const tasks = new Hono<AppEnv>();

// GET /tasks - List tasks with optional filters
tasks.get('/', async (c) => {
  try {
    const projectId = c.req.query('project_id');
    const milestoneId = c.req.query('milestone_id');
    const status = c.req.query('status');
    const priority = c.req.query('priority');
    const overdue = c.req.query('overdue'); // 'true' to get overdue tasks

    let sql = 'SELECT * FROM tasks';
    const params: string[] = [];
    const clauses: string[] = [];

    if (projectId) {
      clauses.push('project_id = ?');
      params.push(projectId);
    }
    if (milestoneId) {
      clauses.push('milestone_id = ?');
      params.push(milestoneId);
    }
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (priority) {
      clauses.push('priority = ?');
      params.push(priority);
    }
    if (overdue === 'true') {
      clauses.push("deadline < date('now') AND status NOT IN ('done', 'deferred')");
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 3 END, deadline ASC NULLS LAST, sort_order ASC';

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return c.json({ tasks: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tasks] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /tasks/:id - Get a single task
tasks.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    const blockers = await c.env.DB.prepare(
      `SELECT * FROM blockers WHERE task_id = ? AND status = 'open'`,
    ).bind(id).all();

    return c.json({ task, blockers: blockers.results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tasks] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /tasks - Create a new task
tasks.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.title || typeof data.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'title is required' } }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO tasks (id, project_id, milestone_id, title, description, status, priority, deadline, blocked_reason, deferred_until, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      (data.project_id ?? '').toString() || null,
      (data.milestone_id ?? '').toString() || null,
      data.title,
      (data.description ?? '').toString(),
      (data.status ?? 'todo').toString(),
      (data.priority ?? 'medium').toString(),
      (data.deadline ?? '').toString() || null,
      (data.blocked_reason ?? '').toString() || null,
      (data.deferred_until ?? '').toString() || null,
      Number(data.sort_order) || 0,
      now,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tasks] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /tasks/:id - Update a task
tasks.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    const stringFields = [
      'project_id', 'milestone_id', 'title', 'description', 'status',
      'priority', 'deadline', 'completed_date', 'blocked_reason', 'deferred_until',
    ];

    for (const field of stringFields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push((data[field] ?? '').toString() || null);
      }
    }
    if ('sort_order' in data) {
      sets.push('sort_order = ?');
      params.push(Number(data.sort_order) || 0);
    }

    // Auto-set completed_date when status changes to done
    if (data.status === 'done' && !('completed_date' in data)) {
      sets.push('completed_date = ?');
      params.push(now);
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await c.env.DB.prepare(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tasks] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /tasks/:id - Delete a task
tasks.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tasks] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

export { tasks };
