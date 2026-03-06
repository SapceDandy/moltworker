import { Hono } from 'hono';
import type { AppEnv } from '../types';

const agentLogs = new Hono<AppEnv>();

// GET /agent-logs - List agent action logs with optional filters
agentLogs.get('/', async (c) => {
  try {
    const action = c.req.query('action');
    const source = c.req.query('source');
    const since = c.req.query('since'); // ISO date string
    const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

    let sql = 'SELECT * FROM agent_logs';
    const params: string[] = [];
    const clauses: string[] = [];

    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    if (source) {
      clauses.push('source = ?');
      params.push(source);
    }
    if (since) {
      clauses.push('created_at >= ?');
      params.push(since);
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit.toString());

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ logs: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[agent-logs] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

export { agentLogs };
