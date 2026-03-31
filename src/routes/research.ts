import { Hono } from 'hono';
import type { AppEnv } from '../types';

const research = new Hono<AppEnv>();

// Research categories (ordered for display)
const CATEGORIES = [
  'company_overview',
  'online_presence',
  'key_people',
  'pain_points',
  'competition',
  'recent_activity',
  'contact_intel',
  'custom',
] as const;

// GET /research?lead_id=&category= - List research entries
research.get('/', async (c) => {
  try {
    const leadId = c.req.query('lead_id');
    if (!leadId) {
      return c.json({ error: { code: 'VALIDATION', message: 'lead_id is required' } }, 400);
    }

    const category = c.req.query('category');
    let sql = 'SELECT * FROM company_research WHERE lead_id = ?';
    const params: string[] = [leadId];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY CASE category '
      + CATEGORIES.map((cat, i) => `WHEN '${cat}' THEN ${i}`).join(' ')
      + ` ELSE ${CATEGORIES.length} END, created_at DESC`;

    const stmt = c.env.DB.prepare(sql);
    const { results } = await stmt.bind(...params).all();
    return c.json({ research: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[research] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /research/:id - Get a single research entry
research.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const entry = await c.env.DB.prepare('SELECT * FROM company_research WHERE id = ?').bind(id).first();
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Research entry not found' } }, 404);
    }
    return c.json({ entry });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[research] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /research - Create a research entry (or batch)
research.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    // Support batch: { entries: [...] } or single: { lead_id, category, ... }
    const items: Record<string, unknown>[] = Array.isArray((body as Record<string, unknown>).entries)
      ? (body as Record<string, unknown>).entries as Record<string, unknown>[]
      : [body as Record<string, unknown>];

    const ids: string[] = [];
    const now = new Date().toISOString();

    for (const data of items) {
      if (!data.lead_id || typeof data.lead_id !== 'string') {
        return c.json({ error: { code: 'VALIDATION', message: 'lead_id is required' } }, 400);
      }
      if (!data.category || typeof data.category !== 'string') {
        return c.json({ error: { code: 'VALIDATION', message: 'category is required' } }, 400);
      }
      if (!data.title || typeof data.title !== 'string') {
        return c.json({ error: { code: 'VALIDATION', message: 'title is required' } }, 400);
      }
      if (!data.content || typeof data.content !== 'string') {
        return c.json({ error: { code: 'VALIDATION', message: 'content is required' } }, 400);
      }

      const id = (data.id ?? crypto.randomUUID()).toString();
      ids.push(id);

      await c.env.DB.prepare(
        `INSERT INTO company_research (id, lead_id, category, title, content, source_url, source_label, confidence, gathered_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        data.lead_id,
        data.category,
        data.title,
        data.content,
        (data.source_url ?? '').toString() || null,
        (data.source_label ?? '').toString() || null,
        (data.confidence ?? 'medium').toString(),
        (data.gathered_by ?? 'agent').toString(),
        now,
        now,
      ).run();
    }

    return c.json({ ok: true, ids }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[research] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /research/:id - Update a research entry
research.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM company_research WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Research entry not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    const fields = ['category', 'title', 'content', 'source_url', 'source_label', 'confidence', 'gathered_by'];
    for (const field of fields) {
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
      `UPDATE company_research SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[research] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /research/:id - Delete a research entry
research.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM company_research WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Research entry not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM company_research WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[research] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// GET /research/summary/:lead_id - Get research summary (counts per category)
research.get('/summary/:lead_id', async (c) => {
  try {
    const leadId = c.req.param('lead_id');
    const { results } = await c.env.DB.prepare(
      `SELECT category, COUNT(*) as count, MAX(created_at) as latest
       FROM company_research WHERE lead_id = ? GROUP BY category`,
    ).bind(leadId).all();

    const total = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM company_research WHERE lead_id = ?',
    ).bind(leadId).first();

    return c.json({
      summary: results,
      total: (total as Record<string, unknown>)?.count ?? 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[research] Summary failed:', msg);
    return c.json({ error: { code: 'SUMMARY_FAILED', message: msg } }, 500);
  }
});

export { research };
