import { Hono } from 'hono';
import type { AppEnv } from '../types';

const actions = new Hono<AppEnv>();

// GET /actions - List draft actions with optional filters
actions.get('/', async (c) => {
  try {
    const status = c.req.query('status');
    const taskId = c.req.query('task_id');
    const leadId = c.req.query('lead_id');
    const actionType = c.req.query('action_type');
    const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

    let sql = 'SELECT * FROM draft_actions';
    const params: string[] = [];
    const clauses: string[] = [];

    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (taskId) {
      clauses.push('task_id = ?');
      params.push(taskId);
    }
    if (leadId) {
      clauses.push('lead_id = ?');
      params.push(leadId);
    }
    if (actionType) {
      clauses.push('action_type = ?');
      params.push(actionType);
    }

    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';
    sql += ` LIMIT ${limit}`;

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    // Get pending count for badge
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM draft_actions WHERE status = 'pending'",
    ).first();
    const pendingCount = (countRow as Record<string, number> | null)?.count ?? 0;

    return c.json({ actions: results, pending_count: pendingCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[actions] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /actions/:id - Get a single action
actions.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const action = await c.env.DB.prepare('SELECT * FROM draft_actions WHERE id = ?').bind(id).first();
    if (!action) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Action not found' } }, 404);
    }
    return c.json({ action });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[actions] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /actions - Create a draft action (typically by the agent)
actions.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;

    if (!data.action_type || !data.title || !data.content) {
      return c.json({ error: { code: 'VALIDATION', message: 'action_type, title, and content are required' } }, 400);
    }

    const validTypes = ['email_draft', 'calendar_event', 'task_update', 'message'];
    if (!validTypes.includes(data.action_type as string)) {
      return c.json({
        error: { code: 'VALIDATION', message: `action_type must be one of: ${validTypes.join(', ')}` },
      }, 400);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO draft_actions (id, task_id, lead_id, action_type, title, content, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        (data.task_id as string) || null,
        (data.lead_id as string) || null,
        data.action_type as string,
        data.title as string,
        typeof data.content === 'string' ? data.content : JSON.stringify(data.content),
        'pending',
        (data.created_by as string) || 'agent',
        now,
        now,
      )
      .run();

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[actions] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /actions/:id/approve - Approve a draft action
actions.put('/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const action = await c.env.DB.prepare('SELECT * FROM draft_actions WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
    if (!action) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Action not found' } }, 404);
    }

    if (action.status !== 'pending') {
      return c.json({ error: { code: 'INVALID_STATUS', message: `Action is already ${action.status}` } }, 400);
    }

    const now = new Date().toISOString();
    const reviewedBy = c.req.header('X-User-Email') || 'owner';

    await c.env.DB.prepare(
      `UPDATE draft_actions SET status = 'approved', reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(now, reviewedBy, now, id)
      .run();

    return c.json({ ok: true, id, status: 'approved' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[actions] Approve failed:', msg);
    return c.json({ error: { code: 'APPROVE_FAILED', message: msg } }, 500);
  }
});

// PUT /actions/:id/reject - Reject a draft action
actions.put('/:id/reject', async (c) => {
  try {
    const id = c.req.param('id');
    const action = await c.env.DB.prepare('SELECT * FROM draft_actions WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
    if (!action) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Action not found' } }, 404);
    }

    if (action.status !== 'pending') {
      return c.json({ error: { code: 'INVALID_STATUS', message: `Action is already ${action.status}` } }, 400);
    }

    const now = new Date().toISOString();
    const reviewedBy = c.req.header('X-User-Email') || 'owner';
    const body = await c.req.json().catch(() => ({}));
    const reason = (body as Record<string, unknown>).reason || '';

    await c.env.DB.prepare(
      `UPDATE draft_actions SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, result = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(now, reviewedBy, reason as string, now, id)
      .run();

    return c.json({ ok: true, id, status: 'rejected' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[actions] Reject failed:', msg);
    return c.json({ error: { code: 'REJECT_FAILED', message: msg } }, 500);
  }
});

// PUT /actions/:id/send - Approve and execute an email_draft action
// This endpoint approves the draft and sends the email via Gmail API
actions.put('/:id/send', async (c) => {
  try {
    const id = c.req.param('id');
    const action = await c.env.DB.prepare('SELECT * FROM draft_actions WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
    if (!action) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Action not found' } }, 404);
    }

    if (action.status !== 'pending' && action.status !== 'approved') {
      return c.json({ error: { code: 'INVALID_STATUS', message: `Action is ${action.status}, cannot send` } }, 400);
    }

    if (action.action_type !== 'email_draft') {
      return c.json({ error: { code: 'INVALID_TYPE', message: 'Only email_draft actions can be sent' } }, 400);
    }

    // Send the email via the internal gmail send endpoint
    const content = typeof action.content === 'string' ? JSON.parse(action.content as string) : action.content;
    const sendResp = await fetch(new URL('/api/google/gmail/send', c.req.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': c.req.header('Authorization') || '',
        'Cookie': c.req.header('Cookie') || '',
        'Cf-Access-Jwt-Assertion': c.req.header('Cf-Access-Jwt-Assertion') || '',
      },
      body: JSON.stringify(content),
    });

    const now = new Date().toISOString();
    const reviewedBy = c.req.header('X-User-Email') || 'owner';

    if (sendResp.ok) {
      const sendResult = await sendResp.json();
      await c.env.DB.prepare(
        `UPDATE draft_actions SET status = 'sent', reviewed_at = ?, reviewed_by = ?, result = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(now, reviewedBy, JSON.stringify(sendResult), now, id)
        .run();
      return c.json({ ok: true, id, status: 'sent', result: sendResult });
    } else {
      const errBody = await sendResp.text();
      await c.env.DB.prepare(
        `UPDATE draft_actions SET status = 'failed', reviewed_at = ?, reviewed_by = ?, result = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(now, reviewedBy, errBody, now, id)
        .run();
      return c.json({ error: { code: 'SEND_FAILED', message: errBody } }, 500);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[actions] Send failed:', msg);
    return c.json({ error: { code: 'SEND_FAILED', message: msg } }, 500);
  }
});

export { actions };
