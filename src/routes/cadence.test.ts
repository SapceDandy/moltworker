import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cadence } from './cadence';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('cadence routes', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let app: Hono<AppEnv>;
  let env: MoltbotEnv;

  function req(path: string, init?: RequestInit) {
    return app.request(path, init, env);
  }

  beforeEach(() => {
    suppressConsole();
    mockD1 = createMockD1();
    app = new Hono<AppEnv>();
    app.route('/cadence', cadence);
    env = createMockEnv({ DB: mockD1.db });
  });

  // ============================================================
  // PIPELINES
  // ============================================================

  describe('POST /cadence/pipelines', () => {
    it('creates a pipeline', async () => {
      const res = await req('/cadence/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Cold Outbound', description: 'Test pipeline' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.id).toBeTruthy();

      const rows = mockD1.getAll('sales_pipelines');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Cold Outbound');
    });

    it('returns 400 for missing name', async () => {
      const res = await req('/cadence/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'No name' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /cadence/pipelines', () => {
    it('returns empty list', async () => {
      const res = await req('/cadence/pipelines');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.pipelines).toEqual([]);
    });

    it('returns seeded pipelines', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold Outbound', is_default: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines');
      const body = (await res.json()) as any;
      expect(body.pipelines).toHaveLength(1);
      expect(body.pipelines[0].name).toBe('Cold Outbound');
    });
  });

  describe('GET /cadence/pipelines/:id', () => {
    it('returns pipeline with stages', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Research', stage_type: 'research', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
        { id: 's2', pipeline_id: 'p1', stage_number: 2, name: 'Outreach', stage_type: 'email', default_owner: 'ai_draft', delay_days: 1, created_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines/p1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.pipeline.name).toBe('Cold');
      expect(body.stages).toHaveLength(2);
    });

    it('returns 404 for non-existent pipeline', async () => {
      const res = await req('/cadence/pipelines/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /cadence/pipelines/:id', () => {
    it('updates pipeline name', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Old', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines/p1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/pipelines/nope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /cadence/pipelines/:id', () => {
    it('deletes a pipeline', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Test', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines/p1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('sales_pipelines')).toHaveLength(0);
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/pipelines/nope', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // STAGES
  // ============================================================

  describe('POST /cadence/pipelines/:id/stages', () => {
    it('creates a stage', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Test', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines/p1/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Research', stage_number: 1, stage_type: 'research', default_owner: 'ai', delay_days: 0 }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for non-existent pipeline', async () => {
      const res = await req('/cadence/pipelines/nope/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X', stage_number: 1 }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing fields', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Test', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines/p1/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /cadence/pipelines/:id/stages', () => {
    it('returns stages for pipeline', async () => {
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Research', stage_type: 'research', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
        { id: 's2', pipeline_id: 'p1', stage_number: 2, name: 'Email', stage_type: 'email', default_owner: 'ai', delay_days: 1, created_at: '2026-01-01' },
        { id: 's3', pipeline_id: 'p2', stage_number: 1, name: 'Other', stage_type: 'email', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/pipelines/p1/stages');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.stages).toHaveLength(2);
    });
  });

  describe('PUT /cadence/stages/:id', () => {
    it('updates a stage', async () => {
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Old', stage_type: 'email', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/stages/s1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New', delay_days: 3 }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/stages/nope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /cadence/stages/:id', () => {
    it('deletes a stage', async () => {
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Test', stage_type: 'email', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/stages/s1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('pipeline_stages')).toHaveLength(0);
    });
  });

  // ============================================================
  // CADENCES
  // ============================================================

  describe('POST /cadence/cadences', () => {
    it('creates a cadence with auto-scheduled touches', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold', is_default: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Research', stage_type: 'research', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
        { id: 's2', pipeline_id: 'p1', stage_number: 2, name: 'Outreach', stage_type: 'email', default_owner: 'ai_draft', delay_days: 1, created_at: '2026-01-01' },
      ]);
      mockD1.seed('leads', [
        { id: 'lead1', domain: 'test.com', business_name: 'Test Corp', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);

      const res = await req('/cadence/cadences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: 'lead1' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);

      const cadences = mockD1.getAll('sales_cadences');
      expect(cadences).toHaveLength(1);
      expect(cadences[0].status).toBe('active');
      expect(cadences[0].pipeline_id).toBe('p1');
      expect(cadences[0].current_stage_id).toBe('s1');

      // Should have auto-scheduled touches for both stages
      const touches = mockD1.getAll('touch_log');
      expect(touches).toHaveLength(2);
    });

    it('returns 400 for missing lead_id', async () => {
      const res = await req('/cadence/cadences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no default pipeline', async () => {
      const res = await req('/cadence/cadences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: 'lead1' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /cadence/cadences', () => {
    it('returns cadences with lead info', async () => {
      mockD1.seed('leads', [
        { id: 'lead1', domain: 'test.com', business_name: 'Test Corp', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'lead1', pipeline_id: 'p1', status: 'active', priority: 'high', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);

      const res = await req('/cadence/cadences');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.cadences).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
        { id: 'c2', lead_id: 'l2', pipeline_id: 'p1', status: 'won', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/cadences?status=active');
      const body = (await res.json()) as any;
      expect(body.cadences).toHaveLength(1);
    });
  });

  describe('GET /cadence/cadences/:id', () => {
    it('returns cadence detail with touches and stages', async () => {
      mockD1.seed('leads', [
        { id: 'lead1', domain: 'test.com', business_name: 'Test Corp', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Research', stage_type: 'research', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
      ]);
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'lead1', pipeline_id: 'p1', current_stage_id: 's1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('touch_log', [
        { id: 't1', cadence_id: 'c1', stage_id: 's1', touch_type: 'research', owner: 'ai', status: 'scheduled', scheduled_at: '2026-01-01', created_at: '2026-01-01' },
      ]);

      const res = await req('/cadence/cadences/c1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.cadence).toBeTruthy();
      expect(body.touches).toHaveLength(1);
      expect(body.stages).toHaveLength(1);
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/cadences/nope');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /cadence/cadences/:id', () => {
    it('updates cadence status', async () => {
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/cadences/c1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused', health: 'at_risk' }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/cadences/nope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /cadence/cadences/:id', () => {
    it('deletes a cadence', async () => {
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/cadences/c1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('sales_cadences')).toHaveLength(0);
    });
  });

  // ============================================================
  // TOUCHES
  // ============================================================

  describe('POST /cadence/cadences/:id/touches', () => {
    it('logs a manual touch', async () => {
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/cadences/c1/touches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touch_type: 'call', owner: 'human', outcome: 'good', outcome_notes: 'Interested' }),
      });
      expect(res.status).toBe(201);
      const touches = mockD1.getAll('touch_log');
      expect(touches).toHaveLength(1);
      expect(touches[0].outcome).toBe('good');
    });

    it('returns 404 for non-existent cadence', async () => {
      const res = await req('/cadence/cadences/nope/touches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touch_type: 'call' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /cadence/touches/:id', () => {
    it('completes a touch with outcome', async () => {
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('touch_log', [
        { id: 't1', cadence_id: 'c1', stage_id: 's1', touch_type: 'call', owner: 'human', status: 'scheduled', created_at: '2026-01-01' },
      ]);
      const res = await req('/cadence/touches/t1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', outcome: 'fantastic', outcome_notes: 'Booked meeting!' }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/touches/nope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // ADVANCE
  // ============================================================

  describe('POST /cadence/cadences/:id/advance', () => {
    it('advances to next stage', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Research', stage_type: 'research', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
        { id: 's2', pipeline_id: 'p1', stage_number: 2, name: 'Outreach', stage_type: 'email', default_owner: 'ai_draft', delay_days: 1, created_at: '2026-01-01' },
      ]);
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', current_stage_id: 's1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);

      const res = await req('/cadence/cadences/c1/advance', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.current_stage.name).toBe('Outreach');
    });

    it('completes cadence when no more stages', async () => {
      mockD1.seed('sales_pipelines', [
        { id: 'p1', name: 'Cold', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      mockD1.seed('pipeline_stages', [
        { id: 's1', pipeline_id: 'p1', stage_number: 1, name: 'Only Stage', stage_type: 'email', default_owner: 'ai', delay_days: 0, created_at: '2026-01-01' },
      ]);
      mockD1.seed('sales_cadences', [
        { id: 'c1', lead_id: 'l1', pipeline_id: 'p1', current_stage_id: 's1', status: 'active', priority: 'medium', health: 'on_track', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);

      const res = await req('/cadence/cadences/c1/advance', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.message).toContain('completed');
    });

    it('returns 404 for non-existent', async () => {
      const res = await req('/cadence/cadences/nope/advance', { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // DASHBOARD
  // ============================================================

  describe('GET /cadence/dashboard', () => {
    it('returns dashboard data', async () => {
      const res = await req('/cadence/dashboard');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.date).toBeTruthy();
      expect(body.due_touches).toBeDefined();
      expect(body.funnel).toBeDefined();
      expect(body.stalled).toBeDefined();
    });
  });
});
