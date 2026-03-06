import { Hono } from 'hono';
import type { AppEnv } from '../types';

const checkins = new Hono<AppEnv>();

// GET /checkins - List check-ins with optional date/type filter
checkins.get('/', async (c) => {
  try {
    const date = c.req.query('date');
    const type = c.req.query('type');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100);

    let sql = 'SELECT * FROM daily_checkins';
    const params: string[] = [];
    const clauses: string[] = [];

    if (date) {
      clauses.push('checkin_date = ?');
      params.push(date);
    }
    if (type) {
      clauses.push('checkin_type = ?');
      params.push(type);
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit.toString());

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ checkins: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[checkins] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// POST /checkins - Log a check-in
checkins.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.checkin_type || typeof data.checkin_type !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'checkin_type is required' } }, 400);
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO daily_checkins (id, checkin_date, checkin_type, summary, tasks_planned, tasks_completed, tasks_rolled, mood, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      (data.checkin_date ?? today).toString(),
      data.checkin_type,
      (data.summary ?? '').toString() || null,
      typeof data.tasks_planned === 'object' ? JSON.stringify(data.tasks_planned) : (data.tasks_planned ?? '').toString() || null,
      typeof data.tasks_completed === 'object' ? JSON.stringify(data.tasks_completed) : (data.tasks_completed ?? '').toString() || null,
      typeof data.tasks_rolled === 'object' ? JSON.stringify(data.tasks_rolled) : (data.tasks_rolled ?? '').toString() || null,
      (data.mood ?? '').toString() || null,
      (data.notes ?? '').toString() || null,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[checkins] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// BLOCKERS
// ============================================================

const blockers = new Hono<AppEnv>();

// GET /blockers - List blockers with optional filters
blockers.get('/', async (c) => {
  try {
    const status = c.req.query('status');
    const projectId = c.req.query('project_id');

    let sql = 'SELECT * FROM blockers';
    const params: string[] = [];
    const clauses: string[] = [];

    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (projectId) {
      clauses.push('project_id = ?');
      params.push(projectId);
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 3 END, created_at DESC';

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return c.json({ blockers: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[blockers] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// POST /blockers - Create a blocker
blockers.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.description || typeof data.description !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'description is required' } }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO blockers (id, project_id, task_id, description, status, severity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      (data.project_id ?? '').toString() || null,
      (data.task_id ?? '').toString() || null,
      data.description,
      (data.status ?? 'open').toString(),
      (data.severity ?? 'medium').toString(),
      now,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[blockers] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /blockers/:id - Update a blocker (resolve, change severity, etc.)
blockers.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM blockers WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Blocker not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    const stringFields = ['description', 'status', 'severity', 'resolution'];
    for (const field of stringFields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push((data[field] ?? '').toString() || null);
      }
    }

    // Auto-set resolved_at when status changes to resolved
    if (data.status === 'resolved' && !('resolved_at' in data)) {
      sets.push('resolved_at = ?');
      params.push(now);
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await c.env.DB.prepare(
      `UPDATE blockers SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[blockers] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

export { checkins, blockers };
