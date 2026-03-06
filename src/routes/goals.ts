import { Hono } from 'hono';
import type { AppEnv } from '../types';

const goals = new Hono<AppEnv>();

// ============================================================
// GOALS
// ============================================================

// GET /goals - List goals with optional project filter
goals.get('/', async (c) => {
  try {
    const projectId = c.req.query('project_id');
    const status = c.req.query('status');

    let sql = 'SELECT * FROM goals';
    const params: string[] = [];
    const clauses: string[] = [];

    if (projectId) {
      clauses.push('project_id = ?');
      params.push(projectId);
    }
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY updated_at DESC';

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return c.json({ goals: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[goals] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /goals/:id - Get a single goal
goals.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const goal = await c.env.DB.prepare('SELECT * FROM goals WHERE id = ?').bind(id).first();
    if (!goal) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } }, 404);
    }
    return c.json({ goal });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[goals] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /goals - Create a goal
goals.post('/', async (c) => {
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
      `INSERT INTO goals (id, project_id, title, description, metric, target_value, current_value, status, target_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      (data.project_id ?? '').toString() || null,
      data.title,
      (data.description ?? '').toString(),
      (data.metric ?? '').toString() || null,
      (data.target_value ?? '').toString() || null,
      (data.current_value ?? '').toString() || null,
      (data.status ?? 'active').toString(),
      (data.target_date ?? '').toString() || null,
      now,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[goals] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /goals/:id - Update a goal
goals.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM goals WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } }, 404);
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
      'project_id', 'title', 'description', 'metric',
      'target_value', 'current_value', 'status', 'target_date',
    ];

    for (const field of stringFields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push((data[field] ?? '').toString() || null);
      }
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await c.env.DB.prepare(
      `UPDATE goals SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[goals] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /goals/:id
goals.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM goals WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM goals WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[goals] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// MILESTONES
// ============================================================

const milestones = new Hono<AppEnv>();

// GET /milestones - List milestones with optional project filter
milestones.get('/', async (c) => {
  try {
    const projectId = c.req.query('project_id');

    let sql = 'SELECT * FROM milestones';
    const params: string[] = [];

    if (projectId) {
      sql += ' WHERE project_id = ?';
      params.push(projectId);
    }
    sql += ' ORDER BY sort_order ASC, target_date ASC';

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return c.json({ milestones: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[milestones] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /milestones/:id
milestones.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const milestone = await c.env.DB.prepare('SELECT * FROM milestones WHERE id = ?').bind(id).first();
    if (!milestone) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }, 404);
    }

    const taskCounts = await c.env.DB.prepare(
      `SELECT status, COUNT(*) as count FROM tasks WHERE milestone_id = ? GROUP BY status`,
    ).bind(id).all();

    return c.json({ milestone, task_counts: taskCounts.results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[milestones] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /milestones - Create a milestone
milestones.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.title || typeof data.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'title is required' } }, 400);
    }
    if (!data.project_id || typeof data.project_id !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'project_id is required' } }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO milestones (id, project_id, title, description, status, percent_complete, target_date, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      data.project_id,
      data.title,
      (data.description ?? '').toString(),
      (data.status ?? 'pending').toString(),
      Number(data.percent_complete) || 0,
      (data.target_date ?? '').toString() || null,
      Number(data.sort_order) || 0,
      now,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[milestones] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /milestones/:id - Update a milestone
milestones.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM milestones WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    const stringFields = ['title', 'description', 'status', 'target_date', 'completed_date'];
    for (const field of stringFields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push((data[field] ?? '').toString() || null);
      }
    }
    if ('percent_complete' in data) {
      sets.push('percent_complete = ?');
      params.push(Number(data.percent_complete) || 0);
    }
    if ('sort_order' in data) {
      sets.push('sort_order = ?');
      params.push(Number(data.sort_order) || 0);
    }

    // Auto-set completed_date when status changes to completed
    if (data.status === 'completed' && !('completed_date' in data)) {
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
      `UPDATE milestones SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[milestones] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /milestones/:id
milestones.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM milestones WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM milestones WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[milestones] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

export { goals, milestones };
