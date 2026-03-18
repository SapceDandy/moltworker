import { Hono } from 'hono';
import type { AppEnv } from '../types';

const browserCookies = new Hono<AppEnv>();

// GET /browser/cookies - List all stored cookie domains
browserCookies.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, domain, label, expires_at, created_at, updated_at,
        LENGTH(cookies_json) as cookies_size
       FROM browser_cookies
       ORDER BY updated_at DESC`,
    ).all();

    return c.json({ cookies: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[browser-cookies] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /browser/cookies/:domain - Get cookies for a specific domain
browserCookies.get('/:domain', async (c) => {
  try {
    const domain = c.req.param('domain');
    const row = await c.env.DB.prepare(
      `SELECT * FROM browser_cookies WHERE domain = ?`,
    ).bind(domain).first();

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: `No cookies stored for ${domain}` } }, 404);
    }

    return c.json({
      id: row.id,
      domain: row.domain,
      label: row.label,
      cookies: JSON.parse(row.cookies_json as string),
      expires_at: row.expires_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[browser-cookies] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /browser/cookies - Store cookies for a domain (upsert)
browserCookies.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { domain, cookies, label, expires_at } = body;

    if (!domain || !cookies) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'domain and cookies are required' } }, 400);
    }

    // Validate cookies is an array
    let cookiesArray: unknown[];
    if (typeof cookies === 'string') {
      try {
        cookiesArray = JSON.parse(cookies);
      } catch {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'cookies must be valid JSON array' } }, 400);
      }
    } else if (Array.isArray(cookies)) {
      cookiesArray = cookies;
    } else {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'cookies must be an array' } }, 400);
    }

    const now = new Date().toISOString();
    const cookiesJson = JSON.stringify(cookiesArray);

    // Upsert: replace if domain already exists
    const existing = await c.env.DB.prepare(
      `SELECT id FROM browser_cookies WHERE domain = ?`,
    ).bind(domain).first();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE browser_cookies SET cookies_json = ?, label = ?, expires_at = ?, updated_at = ? WHERE domain = ?`,
      ).bind(cookiesJson, label || null, expires_at || null, now, domain).run();

      return c.json({ id: existing.id, domain, cookie_count: cookiesArray.length, updated: true });
    } else {
      const id = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO browser_cookies (id, domain, cookies_json, label, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, domain, cookiesJson, label || null, expires_at || null, now, now).run();

      return c.json({ id, domain, cookie_count: cookiesArray.length, created: true });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[browser-cookies] Store failed:', msg);
    return c.json({ error: { code: 'STORE_FAILED', message: msg } }, 500);
  }
});

// DELETE /browser/cookies/:domain - Delete cookies for a domain
browserCookies.delete('/:domain', async (c) => {
  try {
    const domain = c.req.param('domain');
    const result = await c.env.DB.prepare(
      `DELETE FROM browser_cookies WHERE domain = ?`,
    ).bind(domain).run();

    if (!result.meta.changes || result.meta.changes === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: `No cookies stored for ${domain}` } }, 404);
    }

    return c.json({ ok: true, domain });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[browser-cookies] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

export { browserCookies };
