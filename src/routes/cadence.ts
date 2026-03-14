import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { generateAiBrief } from '../gateway/rpc';

const cadence = new Hono<AppEnv>();

// ============================================================
// PIPELINES
// ============================================================

// GET /cadence/pipelines - List all pipelines
cadence.get('/pipelines', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM sales_pipelines ORDER BY is_default DESC, created_at ASC',
    ).all();
    return c.json({ pipelines: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] List pipelines failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /cadence/pipelines/:id - Get pipeline with stages
cadence.get('/pipelines/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const pipeline = await c.env.DB.prepare('SELECT * FROM sales_pipelines WHERE id = ?').bind(id).first();
    if (!pipeline) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Pipeline not found' } }, 404);
    }
    const { results: stages } = await c.env.DB.prepare(
      'SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC',
    ).bind(id).all();
    return c.json({ pipeline, stages });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Get pipeline failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /cadence/pipelines - Create a pipeline
cadence.post('/pipelines', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    if (!data.name) {
      return c.json({ error: { code: 'VALIDATION', message: 'name is required' } }, 400);
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO sales_pipelines (id, name, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      id,
      (data.name as string),
      (data.description as string) || null,
      data.is_default ? 1 : 0,
      now, now,
    ).run();
    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Create pipeline failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /cadence/pipelines/:id - Update a pipeline
cadence.put('/pipelines/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM sales_pipelines WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Pipeline not found' } }, 404);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    if ('name' in data) { sets.push('name = ?'); params.push(data.name); }
    if ('description' in data) { sets.push('description = ?'); params.push(data.description || null); }
    if ('is_default' in data) { sets.push('is_default = ?'); params.push(data.is_default ? 1 : 0); }
    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE sales_pipelines SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Update pipeline failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /cadence/pipelines/:id - Delete a pipeline
cadence.delete('/pipelines/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM sales_pipelines WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Pipeline not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM sales_pipelines WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Delete pipeline failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// PIPELINE STAGES
// ============================================================

// GET /cadence/pipelines/:id/stages - List stages for a pipeline
cadence.get('/pipelines/:id/stages', async (c) => {
  try {
    const pipelineId = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC',
    ).bind(pipelineId).all();
    return c.json({ stages: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] List stages failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// POST /cadence/pipelines/:id/stages - Create a stage
cadence.post('/pipelines/:id/stages', async (c) => {
  try {
    const pipelineId = c.req.param('id');
    const pipeline = await c.env.DB.prepare('SELECT id FROM sales_pipelines WHERE id = ?').bind(pipelineId).first();
    if (!pipeline) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Pipeline not found' } }, 404);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    if (!data.name || data.stage_number == null) {
      return c.json({ error: { code: 'VALIDATION', message: 'name and stage_number are required' } }, 400);
    }
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, pipelineId,
      Number(data.stage_number),
      data.name as string,
      (data.stage_type as string) || 'email',
      (data.default_owner as string) || 'human',
      Number(data.delay_days) || 0,
      (data.framework as string) || null,
      (data.guidance as string) || null,
      typeof data.benchmarks === 'object' ? JSON.stringify(data.benchmarks) : (data.benchmarks as string) || null,
      new Date().toISOString(),
    ).run();
    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Create stage failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /cadence/stages/:id - Update a stage
cadence.put('/stages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM pipeline_stages WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Stage not found' } }, 404);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const stringFields = ['name', 'stage_type', 'default_owner', 'framework', 'guidance'];
    for (const field of stringFields) {
      if (field in data) { sets.push(`${field} = ?`); params.push((data[field] as string) || null); }
    }
    if ('stage_number' in data) { sets.push('stage_number = ?'); params.push(Number(data.stage_number)); }
    if ('delay_days' in data) { sets.push('delay_days = ?'); params.push(Number(data.delay_days) || 0); }
    if ('benchmarks' in data) {
      sets.push('benchmarks = ?');
      params.push(typeof data.benchmarks === 'object' ? JSON.stringify(data.benchmarks) : (data.benchmarks as string) || null);
    }
    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE pipeline_stages SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Update stage failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /cadence/stages/:id - Delete a stage
cadence.delete('/stages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM pipeline_stages WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Stage not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM pipeline_stages WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Delete stage failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// CADENCES
// ============================================================

// GET /cadence/cadences - List cadences with filters
cadence.get('/cadences', async (c) => {
  try {
    const leadId = c.req.query('lead_id');
    const status = c.req.query('status');
    const pipelineId = c.req.query('pipeline_id');
    const health = c.req.query('health');
    const nextTouchBefore = c.req.query('next_touch_before');
    const limit = Math.min(Number(c.req.query('limit')) || 100, 500);

    let sql = `SELECT sc.*, l.business_name, l.domain, l.email as lead_email, l.phone as lead_phone,
               l.match_score as lead_match_score, l.lead_status,
               ps.name as current_stage_name, ps.stage_number as current_stage_number, ps.stage_type as current_stage_type,
               sp.name as pipeline_name
               FROM sales_cadences sc
               LEFT JOIN leads l ON sc.lead_id = l.id
               LEFT JOIN pipeline_stages ps ON sc.current_stage_id = ps.id
               LEFT JOIN sales_pipelines sp ON sc.pipeline_id = sp.id`;
    const params: (string | number)[] = [];
    const clauses: string[] = [];

    if (leadId) { clauses.push('sc.lead_id = ?'); params.push(leadId); }
    if (status) { clauses.push('sc.status = ?'); params.push(status); }
    if (pipelineId) { clauses.push('sc.pipeline_id = ?'); params.push(pipelineId); }
    if (health) { clauses.push('sc.health = ?'); params.push(health); }
    if (nextTouchBefore) { clauses.push('sc.next_touch_due <= ?'); params.push(nextTouchBefore); }

    if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY sc.next_touch_due ASC NULLS LAST, sc.updated_at DESC';
    sql += ` LIMIT ${limit}`;

    const stmt = c.env.DB.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return c.json({ cadences: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] List cadences failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// GET /cadence/cadences/:id - Get cadence detail with touches
cadence.get('/cadences/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const cad = await c.env.DB.prepare(
      `SELECT sc.*, l.business_name, l.domain, l.email as lead_email, l.phone as lead_phone,
       l.website, l.city, l.state, l.category, l.owner_or_people, l.linkedin_company,
       l.match_score as lead_match_score, l.lead_status, l.evidence_snippet, l.notes as lead_notes,
       sp.name as pipeline_name
       FROM sales_cadences sc
       LEFT JOIN leads l ON sc.lead_id = l.id
       LEFT JOIN sales_pipelines sp ON sc.pipeline_id = sp.id
       WHERE sc.id = ?`,
    ).bind(id).first();
    if (!cad) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Cadence not found' } }, 404);
    }

    const { results: touches } = await c.env.DB.prepare(
      `SELECT tl.*, ps.name as stage_name, ps.stage_number, ps.stage_type
       FROM touch_log tl
       LEFT JOIN pipeline_stages ps ON tl.stage_id = ps.id
       WHERE tl.cadence_id = ?
       ORDER BY COALESCE(tl.scheduled_at, tl.created_at) ASC`,
    ).bind(id).all();

    const { results: stages } = await c.env.DB.prepare(
      'SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC',
    ).bind(cad.pipeline_id as string).all();

    return c.json({ cadence: cad, touches, stages });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Get cadence failed:', msg);
    return c.json({ error: { code: 'GET_FAILED', message: msg } }, 500);
  }
});

// POST /cadence/cadences - Create a cadence for a lead
cadence.post('/cadences', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    if (!data.lead_id) {
      return c.json({ error: { code: 'VALIDATION', message: 'lead_id is required' } }, 400);
    }

    // Determine pipeline: use provided or default
    let pipelineId = data.pipeline_id as string | undefined;
    if (!pipelineId) {
      const defaultPipeline = await c.env.DB.prepare(
        'SELECT id FROM sales_pipelines WHERE is_default = 1 LIMIT 1',
      ).first();
      if (!defaultPipeline) {
        return c.json({ error: { code: 'NO_PIPELINE', message: 'No default pipeline found. Create a pipeline first.' } }, 400);
      }
      pipelineId = defaultPipeline.id as string;
    }

    // Get first stage
    const firstStage = await c.env.DB.prepare(
      'SELECT id, delay_days FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC LIMIT 1',
    ).bind(pipelineId).first();

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const nextTouchDue = firstStage
      ? new Date(Date.now() + (Number(firstStage.delay_days) || 0) * 86400000).toISOString().split('T')[0]
      : null;

    await c.env.DB.prepare(
      `INSERT INTO sales_cadences (id, lead_id, pipeline_id, current_stage_id, status, priority, health,
       next_touch_due, owner_notes, lead_score, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      data.lead_id as string,
      pipelineId,
      firstStage ? (firstStage.id as string) : null,
      'active',
      (data.priority as string) || 'medium',
      'on_track',
      nextTouchDue,
      (data.owner_notes as string) || null,
      data.lead_score != null ? Number(data.lead_score) : null,
      now, now, now,
    ).run();

    // Auto-schedule touches for all stages
    if (firstStage) {
      const { results: allStages } = await c.env.DB.prepare(
        'SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_number ASC',
      ).bind(pipelineId).all();

      let cumulativeDelay = 0;
      for (const stage of allStages) {
        cumulativeDelay += Number(stage.delay_days) || 0;
        const scheduledAt = new Date(Date.now() + cumulativeDelay * 86400000).toISOString().split('T')[0];
        await c.env.DB.prepare(
          `INSERT INTO touch_log (id, cadence_id, stage_id, touch_type, owner, status, scheduled_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          id,
          stage.id as string,
          stage.stage_type as string,
          stage.default_owner as string,
          'scheduled',
          scheduledAt,
          now,
        ).run();
      }
    }

    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Create cadence failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /cadence/cadences/:id - Update a cadence
cadence.put('/cadences/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM sales_cadences WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Cadence not found' } }, 404);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];

    const stringFields = ['status', 'priority', 'health', 'next_touch_due', 'loss_reason', 'owner_notes', 'current_stage_id'];
    for (const field of stringFields) {
      if (field in data) { sets.push(`${field} = ?`); params.push((data[field] as string) || null); }
    }
    if ('lead_score' in data) { sets.push('lead_score = ?'); params.push(data.lead_score != null ? Number(data.lead_score) : null); }
    if ('last_touch_at' in data) { sets.push('last_touch_at = ?'); params.push((data.last_touch_at as string) || null); }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE sales_cadences SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Update cadence failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// DELETE /cadence/cadences/:id - Delete a cadence
cadence.delete('/cadences/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM sales_cadences WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Cadence not found' } }, 404);
    }
    await c.env.DB.prepare('DELETE FROM sales_cadences WHERE id = ?').bind(id).run();
    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Delete cadence failed:', msg);
    return c.json({ error: { code: 'DELETE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// TOUCHES
// ============================================================

// GET /cadence/cadences/:id/touches - List touches for a cadence
cadence.get('/cadences/:cadenceId/touches', async (c) => {
  try {
    const cadenceId = c.req.param('cadenceId');
    const { results } = await c.env.DB.prepare(
      `SELECT tl.*, ps.name as stage_name, ps.stage_number, ps.stage_type, ps.framework
       FROM touch_log tl
       LEFT JOIN pipeline_stages ps ON tl.stage_id = ps.id
       WHERE tl.cadence_id = ?
       ORDER BY COALESCE(tl.scheduled_at, tl.created_at) ASC`,
    ).bind(cadenceId).all();
    return c.json({ touches: results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] List touches failed:', msg);
    return c.json({ error: { code: 'LIST_FAILED', message: msg } }, 500);
  }
});

// POST /cadence/cadences/:id/touches - Log a touch manually
cadence.post('/cadences/:cadenceId/touches', async (c) => {
  try {
    const cadenceId = c.req.param('cadenceId');
    const cad = await c.env.DB.prepare('SELECT id FROM sales_cadences WHERE id = ?').bind(cadenceId).first();
    if (!cad) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Cadence not found' } }, 404);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO touch_log (id, cadence_id, stage_id, touch_type, owner, status, outcome, outcome_notes, scheduled_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, cadenceId,
      (data.stage_id as string) || null,
      (data.touch_type as string) || 'note',
      (data.owner as string) || 'human',
      (data.status as string) || 'completed',
      (data.outcome as string) || null,
      (data.outcome_notes as string) || null,
      (data.scheduled_at as string) || null,
      (data.completed_at as string) || now,
      now,
    ).run();
    return c.json({ ok: true, id }, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Create touch failed:', msg);
    return c.json({ error: { code: 'CREATE_FAILED', message: msg } }, 500);
  }
});

// PUT /cadence/touches/:id - Complete/update a touch
cadence.put('/touches/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT * FROM touch_log WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Touch not found' } }, 404);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400);
    }
    const data = body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];

    const stringFields = ['status', 'outcome', 'outcome_notes', 'owner', 'touch_type', 'scheduled_at', 'completed_at', 'gmail_message_id', 'gmail_thread_id', 'action_id'];
    for (const field of stringFields) {
      if (field in data) { sets.push(`${field} = ?`); params.push((data[field] as string) || null); }
    }
    if ('call_prep' in data) {
      sets.push('call_prep = ?');
      params.push(typeof data.call_prep === 'object' ? JSON.stringify(data.call_prep) : (data.call_prep as string) || null);
    }
    if ('email_metrics' in data) {
      sets.push('email_metrics = ?');
      params.push(typeof data.email_metrics === 'object' ? JSON.stringify(data.email_metrics) : (data.email_metrics as string) || null);
    }

    if (sets.length === 0) {
      return c.json({ error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
    }
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE touch_log SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...params).run();

    // If touch completed, update cadence last_touch_at
    if (data.status === 'completed' || data.outcome) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        'UPDATE sales_cadences SET last_touch_at = ?, updated_at = ? WHERE id = ?',
      ).bind(now, now, existing.cadence_id as string).run();
    }

    return c.json({ ok: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Update touch failed:', msg);
    return c.json({ error: { code: 'UPDATE_FAILED', message: msg } }, 500);
  }
});

// POST /cadence/cadences/:id/advance - Advance cadence to next stage
cadence.post('/cadences/:id/advance', async (c) => {
  try {
    const id = c.req.param('id');
    const cad = await c.env.DB.prepare(
      'SELECT * FROM sales_cadences WHERE id = ?',
    ).bind(id).first();
    if (!cad) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Cadence not found' } }, 404);
    }

    // Find current stage number and get next
    const currentStage = cad.current_stage_id
      ? await c.env.DB.prepare('SELECT * FROM pipeline_stages WHERE id = ?').bind(cad.current_stage_id as string).first()
      : null;

    const currentNumber = currentStage ? Number(currentStage.stage_number) : 0;
    const nextStage = await c.env.DB.prepare(
      'SELECT * FROM pipeline_stages WHERE pipeline_id = ? AND stage_number > ? ORDER BY stage_number ASC LIMIT 1',
    ).bind(cad.pipeline_id as string, currentNumber).first();

    if (!nextStage) {
      // No more stages — mark completed
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        "UPDATE sales_cadences SET status = 'completed', current_stage_id = NULL, next_touch_due = NULL, updated_at = ? WHERE id = ?",
      ).bind(now, id).run();
      return c.json({ ok: true, id, status: 'completed', message: 'No more stages — cadence completed' });
    }

    const now = new Date().toISOString();
    const nextTouchDue = new Date(Date.now() + (Number(nextStage.delay_days) || 0) * 86400000).toISOString().split('T')[0];

    await c.env.DB.prepare(
      'UPDATE sales_cadences SET current_stage_id = ?, next_touch_due = ?, updated_at = ? WHERE id = ?',
    ).bind(nextStage.id as string, nextTouchDue, now, id).run();

    return c.json({
      ok: true, id,
      current_stage: { id: nextStage.id, name: nextStage.name, stage_number: nextStage.stage_number },
      next_touch_due: nextTouchDue,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Advance cadence failed:', msg);
    return c.json({ error: { code: 'ADVANCE_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// SALES DASHBOARD
// ============================================================

// GET /cadence/dashboard - Today's due touches, funnel counts, stalled cadences
cadence.get('/dashboard', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [dueTouches, funnelCounts, stalledCadences, activeCounts, recentOutcomes] = await Promise.all([
      // Touches due today or overdue
      c.env.DB.prepare(
        `SELECT tl.*, sc.lead_id, l.business_name, l.domain, ps.name as stage_name, ps.stage_type, ps.framework
         FROM touch_log tl
         JOIN sales_cadences sc ON tl.cadence_id = sc.id
         LEFT JOIN leads l ON sc.lead_id = l.id
         LEFT JOIN pipeline_stages ps ON tl.stage_id = ps.id
         WHERE tl.status = 'scheduled' AND tl.scheduled_at <= ? AND sc.status = 'active'
         ORDER BY tl.scheduled_at ASC
         LIMIT 50`,
      ).bind(today).all(),

      // Funnel: count cadences per stage
      c.env.DB.prepare(
        `SELECT ps.id as stage_id, ps.name as stage_name, ps.stage_number, ps.stage_type,
         COUNT(sc.id) as cadence_count
         FROM pipeline_stages ps
         LEFT JOIN sales_cadences sc ON sc.current_stage_id = ps.id AND sc.status = 'active'
         WHERE ps.pipeline_id = (SELECT id FROM sales_pipelines WHERE is_default = 1 LIMIT 1)
         GROUP BY ps.id
         ORDER BY ps.stage_number ASC`,
      ).all(),

      // Stalled cadences (no touch in 5+ days)
      c.env.DB.prepare(
        `SELECT sc.*, l.business_name, l.domain, ps.name as current_stage_name
         FROM sales_cadences sc
         LEFT JOIN leads l ON sc.lead_id = l.id
         LEFT JOIN pipeline_stages ps ON sc.current_stage_id = ps.id
         WHERE sc.status = 'active' AND (sc.last_touch_at IS NULL OR sc.last_touch_at < datetime('now', '-5 days'))
         ORDER BY sc.last_touch_at ASC NULLS FIRST
         LIMIT 20`,
      ).all(),

      // Summary counts
      c.env.DB.prepare(
        `SELECT
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
          SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
          SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused
         FROM sales_cadences`,
      ).first(),

      // Recent completed touches with outcomes
      c.env.DB.prepare(
        `SELECT tl.outcome, COUNT(*) as count
         FROM touch_log tl
         WHERE tl.status = 'completed' AND tl.outcome IS NOT NULL AND tl.completed_at >= datetime('now', '-7 days')
         GROUP BY tl.outcome`,
      ).all(),
    ]);

    return c.json({
      date: today,
      due_touches: dueTouches.results,
      funnel: funnelCounts.results,
      stalled: stalledCadences.results,
      summary: activeCounts || { active: 0, won: 0, lost: 0, paused: 0 },
      recent_outcomes: recentOutcomes.results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Dashboard failed:', msg);
    return c.json({ error: { code: 'DASHBOARD_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// AI CALL PREP
// ============================================================

const CALL_PREP_SYSTEM = `You are a senior sales coach preparing a rep for their next outreach touch. Output ONLY valid JSON matching this schema:
{
  "summary": "1-2 sentence overview of the lead and where they are in the cadence",
  "intel": {
    "company": "key firmographic facts",
    "contacts": "known contacts and roles",
    "signals": "recent signals (funding, hiring, tech, intent)",
    "history": "summary of prior touches and responses"
  },
  "mindset": "the mental frame the rep should adopt for this touch (confident, curious, consultative, etc.)",
  "navigation": "specific tactical guidance for this touch — what to say, what to ask, what to avoid",
  "outcomes": {
    "fantastic": "best realistic outcome from this touch",
    "good": "solid positive outcome",
    "okay": "acceptable neutral outcome",
    "not_so_good": "slightly negative but recoverable outcome",
    "bad": "worst likely outcome and how to recover"
  },
  "opening_line": "suggested opening line or hook",
  "questions": ["3-5 discovery questions tailored to this stage"],
  "objection_handlers": [{"objection": "likely objection", "response": "suggested response"}]
}
Do NOT include any text outside the JSON. Do NOT use markdown code fences.`;

// POST /cadence/cadences/:id/call-prep - Generate AI call prep brief for a touch
cadence.post('/cadences/:id/call-prep', async (c) => {
  try {
    const id = c.req.param('id');

    // Get cadence with lead and pipeline data
    const cad = await c.env.DB.prepare(
      `SELECT sc.*, l.business_name, l.domain, l.email as lead_email, l.phone as lead_phone,
       l.website, l.city, l.state, l.category, l.owner_or_people, l.linkedin_company,
       l.match_score, l.lead_status, l.evidence_snippet, l.notes as lead_notes,
       sp.name as pipeline_name
       FROM sales_cadences sc
       LEFT JOIN leads l ON sc.lead_id = l.id
       LEFT JOIN sales_pipelines sp ON sc.pipeline_id = sp.id
       WHERE sc.id = ?`,
    ).bind(id).first();
    if (!cad) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Cadence not found' } }, 404);
    }

    // Get current stage details
    const currentStage = cad.current_stage_id
      ? await c.env.DB.prepare('SELECT * FROM pipeline_stages WHERE id = ?').bind(cad.current_stage_id as string).first()
      : null;

    // Get touch history for this cadence
    const { results: touches } = await c.env.DB.prepare(
      `SELECT tl.*, ps.name as stage_name, ps.stage_type
       FROM touch_log tl
       LEFT JOIN pipeline_stages ps ON tl.stage_id = ps.id
       WHERE tl.cadence_id = ?
       ORDER BY COALESCE(tl.scheduled_at, tl.created_at) ASC`,
    ).bind(id).all();

    // Optional: accept a specific touch_id to prep for
    const body = await c.req.json().catch(() => null);
    const targetTouchId = body && typeof body === 'object' ? (body as Record<string, unknown>).touch_id : null;

    // Build context prompt
    const touchHistory = touches.map((t) => {
      const status = t.status === 'completed' ? `✅ ${t.outcome || 'done'}` : t.status === 'skipped' ? '⏭ skipped' : '📅 scheduled';
      return `- ${t.stage_name || t.touch_type} (${t.stage_type || t.touch_type}): ${status}${t.outcome_notes ? ` — ${t.outcome_notes}` : ''}`;
    }).join('\n');

    const emailMetrics = touches
      .filter((t) => t.email_metrics)
      .map((t) => {
        try {
          const m = JSON.parse(t.email_metrics as string);
          return `- ${t.stage_name}: opened=${m.opened || false}${m.replied ? ', replied' : ''}${m.bounced ? ', BOUNCED' : ''}`;
        } catch { return null; }
      })
      .filter(Boolean)
      .join('\n');

    const prompt = `LEAD INFORMATION:
Company: ${cad.business_name || 'Unknown'}
Domain: ${cad.domain || 'N/A'}
Email: ${cad.lead_email || 'N/A'}
Phone: ${cad.lead_phone || 'N/A'}
Location: ${[cad.city, cad.state].filter(Boolean).join(', ') || 'N/A'}
Category: ${cad.category || 'N/A'}
Key People: ${cad.owner_or_people || 'N/A'}
LinkedIn: ${cad.linkedin_company || 'N/A'}
Match Score: ${cad.match_score || 'N/A'}
Lead Status: ${cad.lead_status || 'N/A'}
Evidence/Notes: ${cad.evidence_snippet || ''} ${cad.lead_notes || ''}

CADENCE STATUS:
Pipeline: ${cad.pipeline_name || 'Unknown'}
Current Stage: ${currentStage ? `#${currentStage.stage_number} ${currentStage.name} (${currentStage.stage_type})` : 'N/A'}
Health: ${cad.health}
Priority: ${cad.priority}
Cadence Owner Notes: ${cad.owner_notes || 'None'}

CURRENT STAGE FRAMEWORK:
${currentStage?.framework ? `Methodology: ${currentStage.framework}` : 'No specific framework'}
${currentStage?.guidance ? `Guidance: ${currentStage.guidance}` : ''}
${currentStage?.benchmarks ? `Benchmarks: ${currentStage.benchmarks}` : ''}

TOUCH HISTORY:
${touchHistory || 'No prior touches'}

EMAIL ENGAGEMENT:
${emailMetrics || 'No email metrics yet'}

Generate a call prep brief for the current stage touch. Be specific and actionable.`;

    const result = await generateAiBrief(prompt, c.env, CALL_PREP_SYSTEM);
    if (!result.ok) {
      return c.json({ error: { code: 'AI_FAILED', message: result.text } }, 500);
    }

    // Try to parse as JSON
    let callPrep: Record<string, unknown>;
    try {
      // Strip potential markdown fences
      const cleaned = result.text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      callPrep = JSON.parse(cleaned);
    } catch {
      // If AI didn't return valid JSON, wrap the text
      callPrep = { summary: result.text, raw: true };
    }

    // If a target touch was specified, save the call prep to it
    if (targetTouchId) {
      await c.env.DB.prepare(
        'UPDATE touch_log SET call_prep = ? WHERE id = ?',
      ).bind(JSON.stringify(callPrep), targetTouchId as string).run();
    }

    return c.json({ ok: true, call_prep: callPrep });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cadence] Call prep failed:', msg);
    return c.json({ error: { code: 'CALL_PREP_FAILED', message: msg } }, 500);
  }
});

// ============================================================
// TRACKING PIXEL (no auth — called by email clients)
// ============================================================

const TRANSPARENT_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

// GET /cadence/track/:touchId/open.png - Email open tracking pixel
cadence.get('/track/:touchId/open.png', async (c) => {
  try {
    const touchId = c.req.param('touchId');
    // Record the open — fire-and-forget, don't block the pixel response
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const touch = await c.env.DB.prepare('SELECT id, email_metrics FROM touch_log WHERE id = ?').bind(touchId).first();
          if (touch) {
            const existing = touch.email_metrics ? JSON.parse(touch.email_metrics as string) : {};
            if (!existing.opened) {
              existing.opened = true;
              existing.opened_at = new Date().toISOString();
              await c.env.DB.prepare('UPDATE touch_log SET email_metrics = ? WHERE id = ?')
                .bind(JSON.stringify(existing), touchId).run();
            }
          }
        } catch (err) {
          console.error('[cadence] Track open failed:', err);
        }
      })(),
    );
  } catch {
    // Ignore errors — always return the pixel
  }

  return new Response(TRANSPARENT_PNG, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
});

export { cadence };
