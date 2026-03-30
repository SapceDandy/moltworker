import { Hono } from 'hono';
import type { AppEnv } from '../types';

const projects = new Hono<AppEnv>();

// GET /projects - List projects with optional filters
projects.get('/', async (c) => {
  try {
    const status = c.req.query('status'); // active, paused, completed, archived
    const priority = c.req.query('priority');

    let sql = 'SELECT * FROM projects';
    const params: string[] = [];
    const clauses: string[] = [];

    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (priority) {
      clauses.push('priority = ?');
      params.push(priority);
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 3 END, updated_at DESC';

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return c.json({ projects: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[projects] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /projects/:id - Get a single project with related counts
projects.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!project) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
    }

    const [taskCounts, blockerCount, milestoneCount] = await Promise.all([
      c.env.DB.prepare(
        `SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status`,
      ).bind(id).all(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM blockers WHERE project_id = ? AND status = 'open'`,
      ).bind(id).first(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM milestones WHERE project_id = ?`,
      ).bind(id).first(),
    ]);

    return c.json({
      project,
      task_counts: taskCounts.results,
      open_blockers: (blockerCount as Record<string, unknown>)?.count ?? 0,
      milestones: (milestoneCount as Record<string, unknown>)?.count ?? 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[projects] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /projects - Create a new project
projects.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    if (!data.name || typeof data.name !== 'string') {
      return c.json({ error: { code: 'VALIDATION', message: 'name is required' } }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    await c.env.DB.prepare(
      `INSERT INTO projects (id, name, description, status, priority, health, percent_complete, start_date, target_date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      data.name,
      (data.description ?? '').toString(),
      (data.status ?? 'active').toString(),
      (data.priority ?? 'medium').toString(),
      (data.health ?? 'on_track').toString(),
      Number(data.percent_complete) || 0,
      (data.start_date ?? '').toString() || null,
      (data.target_date ?? '').toString() || null,
      (data.notes ?? '').toString(),
      now,
      now,
    ).run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[projects] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /projects/:id - Update a project
projects.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    const fields: Array<[string, string]> = [
      ['name', 'string'],
      ['description', 'string'],
      ['status', 'string'],
      ['priority', 'string'],
      ['health', 'string'],
      ['start_date', 'string'],
      ['target_date', 'string'],
      ['completed_date', 'string'],
      ['notes', 'string'],
    ];

    for (const [field, type] of fields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push(type === 'string' ? (data[field] ?? '').toString() : data[field]);
      }
    }
    if ('percent_complete' in data) {
      sets.push('percent_complete = ?');
      params.push(Number(data.percent_complete) || 0);
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await c.env.DB.prepare(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[projects] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /projects/:id - Delete a project
// Unlinks tasks/goals/milestones/reminders (sets project_id = NULL)
// Deletes blockers and progress_snapshots tied to this project
projects.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
    }

    // Unlink records that can live independently (set project_id to NULL)
    await c.env.DB.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').bind(id).run();
    await c.env.DB.prepare('UPDATE goals SET project_id = NULL WHERE project_id = ?').bind(id).run();
    await c.env.DB.prepare('UPDATE milestones SET project_id = NULL WHERE project_id = ?').bind(id).run();
    await c.env.DB.prepare('UPDATE reminders SET related_project_id = NULL WHERE related_project_id = ?').bind(id).run();

    // Delete records that don't make sense without a project
    await c.env.DB.prepare('DELETE FROM blockers WHERE project_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM progress_snapshots WHERE project_id = ?').bind(id).run();

    // Delete the project itself
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[projects] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

export { projects };
