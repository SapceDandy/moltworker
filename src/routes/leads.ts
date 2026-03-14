import { Hono } from 'hono';
import type { AppEnv } from '../types';

const leads = new Hono<AppEnv>();

/**
 * Normalize a domain string: extract hostname, strip www., lowercase.
 */
function normalizeDomain(input: string): string {
  try {
    const u = input.startsWith('http') ? new URL(input) : new URL(`https://${input}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return input.replace(/^www\./, '').toLowerCase();
  }
}

/**
 * Convert a value to a CSV-safe string.
 */
function toCsvValue(v: unknown): string {
  const s = (v ?? '').toString().replace(/\r?\n/g, ' ').trim();
  const needsQuotes = /[",]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Build a lead row from arbitrary data object.
 */
function buildLeadRow(data: Record<string, unknown>, domain: string) {
  const website = (data.website ?? '').toString();
  const now = new Date().toISOString();
  return {
    id: (data.id ?? crypto.randomUUID()).toString(),
    domain,
    business_name: (data.business_name ?? '').toString(),
    website: website || `https://${domain}`,
    phone: (data.phone ?? '').toString(),
    email: (data.email ?? '').toString(),
    city: (data.city ?? '').toString(),
    state: (data.state ?? '').toString(),
    category: (data.category ?? '').toString(),
    owner_or_people: (data.owner_or_people ?? '').toString(),
    linkedin_company: (data.linkedin_company ?? '').toString(),
    linkedin_people: Array.isArray(data.linkedin_people)
      ? JSON.stringify(data.linkedin_people)
      : (data.linkedin_people ?? '').toString(),
    contact_page_url: (data.contact_page_url ?? '').toString(),
    source_urls: Array.isArray(data.source_urls)
      ? JSON.stringify(data.source_urls)
      : (data.source_urls ?? '').toString(),
    evidence_snippet: (data.evidence_snippet ?? '').toString(),
    match_score: Number.isFinite(Number(data.match_score)) ? Number(data.match_score) : null,
    notes: (data.notes ?? '').toString(),
    lead_status: (data.lead_status ?? 'new').toString(),
    created_at: now,
    updated_at: now,
  };
}

/**
 * Upsert a single lead row into the database.
 */
async function upsertLead(db: D1Database, row: ReturnType<typeof buildLeadRow>) {
  await db.prepare(
    `INSERT INTO leads (
      id, domain, business_name, website, phone, email, city, state, category,
      owner_or_people, linkedin_company, linkedin_people, contact_page_url, source_urls,
      evidence_snippet, match_score, notes, lead_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(domain) DO UPDATE SET
      business_name=excluded.business_name,
      website=excluded.website,
      phone=excluded.phone,
      email=excluded.email,
      city=excluded.city,
      state=excluded.state,
      category=excluded.category,
      owner_or_people=excluded.owner_or_people,
      linkedin_company=excluded.linkedin_company,
      linkedin_people=excluded.linkedin_people,
      contact_page_url=excluded.contact_page_url,
      source_urls=excluded.source_urls,
      evidence_snippet=excluded.evidence_snippet,
      match_score=excluded.match_score,
      notes=excluded.notes,
      lead_status=excluded.lead_status,
      updated_at=excluded.updated_at`,
  )
    .bind(
      row.id, row.domain, row.business_name, row.website, row.phone,
      row.email, row.city, row.state, row.category, row.owner_or_people,
      row.linkedin_company, row.linkedin_people, row.contact_page_url, row.source_urls,
      row.evidence_snippet, row.match_score, row.notes, row.lead_status,
      row.created_at, row.updated_at,
    )
    .run();
}

// GET /leads - List leads with optional filters
leads.get('/', async (c) => {
  try {
    const category = c.req.query('category');
    const city = c.req.query('city');
    const state = c.req.query('state');
    const status = c.req.query('status');
    const minScore = c.req.query('min_score');
    const search = c.req.query('q');
    const limit = Math.min(Number(c.req.query('limit')) || 200, 1000);
    const offset = Number(c.req.query('offset')) || 0;

    let sql = 'SELECT * FROM leads';
    const params: (string | number)[] = [];
    const clauses: string[] = [];

    if (category) {
      clauses.push('category = ?');
      params.push(category);
    }
    if (city) {
      clauses.push('city = ?');
      params.push(city);
    }
    if (state) {
      clauses.push('state = ?');
      params.push(state);
    }
    if (status) {
      clauses.push('lead_status = ?');
      params.push(status);
    }
    if (minScore) {
      clauses.push('match_score >= ?');
      params.push(Number(minScore));
    }
    if (search) {
      clauses.push('(business_name LIKE ? OR domain LIKE ? OR email LIKE ? OR city LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY COALESCE(match_score, 0) DESC, updated_at DESC';
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM leads';
    if (clauses.length > 0) {
      countSql += ' WHERE ' + clauses.join(' AND ');
    }
    const countStmt = c.env.DB.prepare(countSql);
    const countRow = params.length > 0
      ? await countStmt.bind(...params).first()
      : await countStmt.first();
    const total = (countRow as Record<string, number> | null)?.total ?? 0;

    return c.json({ leads: results, total, limit, offset });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] List failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /leads/:id - Get a single lead
leads.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
    if (!lead) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } }, 404);
    }
    return c.json({ lead });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Get failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /leads - Upsert a lead (keyed by domain)
leads.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }

    const data = body as Record<string, unknown>;
    const website = (data.website ?? '').toString();
    const domain = normalizeDomain((data.domain ?? website).toString());
    if (!domain) {
      return c.json({ error: { code: 'VALIDATION', message: 'domain or website required' } }, 400);
    }

    const row = buildLeadRow(data, domain);

    // Check if this is a new lead (not an update) for auto-enroll
    const existingLead = await c.env.DB.prepare('SELECT id FROM leads WHERE domain = ?').bind(domain).first();

    await upsertLead(c.env.DB, row);

    // Auto-enroll new leads into default sales cadence
    if (!existingLead && data.skip_cadence !== true) {
      try {
        const defaultPipeline = await c.env.DB.prepare(
          'SELECT id FROM sales_pipelines WHERE is_default = 1 LIMIT 1',
        ).first();
        if (defaultPipeline) {
          // Get the lead ID (may differ from row.id if upsert matched)
          const lead = await c.env.DB.prepare('SELECT id FROM leads WHERE domain = ?').bind(domain).first();
          if (lead) {
            const firstStage = await c.env.DB.prepare(
              'SELECT id, delay_days FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC LIMIT 1',
            ).bind(defaultPipeline.id as string).first();

            const now = new Date().toISOString();
            const cadenceId = crypto.randomUUID();
            const nextTouchDue = firstStage
              ? new Date(Date.now() + (Number(firstStage.delay_days) || 0) * 86400000).toISOString().split('T')[0]
              : null;

            await c.env.DB.prepare(
              `INSERT INTO sales_cadences (id, lead_id, pipeline_id, current_stage_id, status, priority, health,
               next_touch_due, lead_score, started_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'active', 'medium', 'on_track', ?, ?, ?, ?, ?)`,
            ).bind(
              cadenceId, lead.id as string, defaultPipeline.id as string,
              firstStage ? (firstStage.id as string) : null,
              nextTouchDue,
              row.match_score,
              now, now, now,
            ).run();

            // Auto-schedule touches for all stages
            if (firstStage) {
              const { results: allStages } = await c.env.DB.prepare(
                'SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC',
              ).bind(defaultPipeline.id as string).all();
              let cumulativeDelay = 0;
              for (const stage of allStages) {
                cumulativeDelay += Number(stage.delay_days) || 0;
                const scheduledAt = new Date(Date.now() + cumulativeDelay * 86400000).toISOString().split('T')[0];
                await c.env.DB.prepare(
                  `INSERT INTO touch_log (id, cadence_id, stage_id, touch_type, owner, status, scheduled_at, created_at)
                   VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
                ).bind(
                  crypto.randomUUID(), cadenceId, stage.id as string,
                  stage.stage_type as string, stage.default_owner as string,
                  scheduledAt, now,
                ).run();
              }
            }
          }
        }
      } catch (enrollErr) {
        console.error('[leads] Auto-enroll cadence failed:', enrollErr);
        // Don't fail the lead creation if cadence enrollment fails
      }
    }

    return c.json({ ok: true, domain: row.domain });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Create failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /leads/:id - Update a lead
leads.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } }, 404);
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
      'business_name', 'website', 'phone', 'email', 'city', 'state',
      'category', 'owner_or_people', 'linkedin_company', 'linkedin_people',
      'contact_page_url', 'source_urls', 'evidence_snippet', 'notes', 'lead_status',
    ];

    for (const field of stringFields) {
      if (field in data) {
        sets.push(`${field} = ?`);
        params.push((data[field] ?? '').toString() || null);
      }
    }
    if ('match_score' in data) {
      sets.push('match_score = ?');
      params.push(Number.isFinite(Number(data.match_score)) ? Number(data.match_score) : null);
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await c.env.DB.prepare(
      `UPDATE leads SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Update failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /leads/:id - Delete a lead
leads.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Delete failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// POST /leads/import - CSV bulk import
leads.post('/import', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';

    let csvText: string;
    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return c.json({ error: { code: 'VALIDATION', message: 'file field required (multipart upload)' } }, 400);
      }
      csvText = await (file as File).text();
    } else {
      // Accept raw CSV body
      csvText = await c.req.text();
    }

    if (!csvText.trim()) {
      return c.json({ error: { code: 'VALIDATION', message: 'Empty CSV' } }, 400);
    }

    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return c.json({ error: { code: 'VALIDATION', message: 'CSV must have a header row and at least one data row' } }, 400);
    }

    // Parse header
    const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

    // Require domain or website column
    const hasDomain = headers.includes('domain');
    const hasWebsite = headers.includes('website');
    if (!hasDomain && !hasWebsite) {
      return c.json({ error: { code: 'VALIDATION', message: 'CSV must have a "domain" or "website" column' } }, 400);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCsvLine(lines[i]);
        const data: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          if (idx < values.length) data[h] = values[idx];
        });

        const website = (data.website ?? '').toString();
        const domain = normalizeDomain((data.domain ?? website).toString());
        if (!domain) {
          skipped++;
          continue;
        }

        const row = buildLeadRow(data, domain);
        await upsertLead(c.env.DB, row);
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Row ${i + 1}: ${msg}`);
        skipped++;
      }
    }

    return c.json({ ok: true, imported, skipped, errors: errors.slice(0, 20), total_rows: lines.length - 1 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Import failed:', msg);
    return c.json({ error: { code: 'IMPORT_FAILED', message: msg } }, 500);
  }
});

// GET /leads/export.csv - Download all leads as CSV
leads.get('/export.csv', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
        domain, business_name, website, phone, email, city, state, category,
        owner_or_people, linkedin_company, linkedin_people, contact_page_url,
        source_urls, evidence_snippet, match_score, notes, lead_status, created_at, updated_at
       FROM leads
       ORDER BY COALESCE(match_score, 0) DESC, updated_at DESC`,
    ).all();

    const csvHeaders = [
      'domain', 'business_name', 'website', 'phone', 'email', 'city', 'state', 'category',
      'owner_or_people', 'linkedin_company', 'linkedin_people', 'contact_page_url',
      'source_urls', 'evidence_snippet', 'match_score', 'notes', 'lead_status', 'created_at', 'updated_at',
    ];

    const csvLines = [csvHeaders.join(',')];
    for (const r of results as Record<string, unknown>[]) {
      csvLines.push(csvHeaders.map((h) => toCsvValue(r[h])).join(','));
    }

    return new Response(csvLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads.csv"',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Export failed:', msg);
    return c.json({ error: { code: 'EXPORT_FAILED', message: msg } }, 500);
  }
});

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export { leads, normalizeDomain, toCsvValue, buildLeadRow, parseCsvLine };
