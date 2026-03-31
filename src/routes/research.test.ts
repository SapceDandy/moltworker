import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { research } from './research';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.route('/research', research);
  return app;
}

describe('research routes', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let app: Hono<AppEnv>;
  let env: MoltbotEnv;

  function req(path: string, init?: RequestInit) {
    return app.request(path, init, env);
  }

  beforeEach(() => {
    suppressConsole();
    mockD1 = createMockD1();
    app = createTestApp();
    env = createMockEnv({ DB: mockD1.db });
    mockD1.seed('leads', [
      { id: 'lead1', domain: 'example.com', business_name: 'Example Corp', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]);
  });

  describe('GET /research', () => {
    it('requires lead_id', async () => {
      const res = await req('/research');
      expect(res.status).toBe(400);
    });

    it('returns entries for a lead', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'Overview', content: 'Details', confidence: 'high', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
        { id: 'r2', lead_id: 'lead1', category: 'key_people', title: 'CEO', content: 'John Doe', confidence: 'medium', gathered_by: 'agent', created_at: '2026-01-02', updated_at: '2026-01-02' },
      ]);
      const res = await req('/research?lead_id=lead1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.research).toHaveLength(2);
    });

    it('filters by category', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'Overview', content: 'Details', confidence: 'high', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
        { id: 'r2', lead_id: 'lead1', category: 'key_people', title: 'CEO', content: 'John', confidence: 'medium', gathered_by: 'agent', created_at: '2026-01-02', updated_at: '2026-01-02' },
      ]);
      const res = await req('/research?lead_id=lead1&category=key_people');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.research).toHaveLength(1);
      expect(body.research[0].category).toBe('key_people');
    });
  });

  describe('GET /research/:id', () => {
    it('returns a single entry', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'Overview', content: 'Details', confidence: 'high', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/research/r1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.entry.id).toBe('r1');
    });

    it('returns 404 for missing entry', async () => {
      const res = await req('/research/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /research', () => {
    it('creates a single research entry', async () => {
      const res = await req('/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: 'lead1',
          category: 'company_overview',
          title: 'HVAC company in Austin',
          content: 'Full-service residential and commercial HVAC.',
          source_url: 'https://example.com/about',
          confidence: 'high',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.ids).toHaveLength(1);
      expect(mockD1.getAll('company_research')).toHaveLength(1);
    });

    it('creates batch entries', async () => {
      const res = await req('/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            { lead_id: 'lead1', category: 'company_overview', title: 'Overview', content: 'Details', confidence: 'high' },
            { lead_id: 'lead1', category: 'key_people', title: 'Owner', content: 'Jane Doe', confidence: 'medium' },
          ],
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.ids).toHaveLength(2);
      expect(mockD1.getAll('company_research')).toHaveLength(2);
    });

    it('validates required fields', async () => {
      const res = await req('/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: 'lead1' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing lead_id', async () => {
      const res = await req('/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'company_overview', title: 'Test', content: 'Data' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /research/:id', () => {
    it('updates an entry', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'Old title', content: 'Old content', confidence: 'low', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/research/r1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated title', confidence: 'high' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for missing entry', async () => {
      const res = await req('/research/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nope' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for no fields', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'Title', content: 'Content', confidence: 'medium', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/research/r1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /research/:id', () => {
    it('deletes an entry', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'Title', content: 'Content', confidence: 'medium', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
      ]);
      const res = await req('/research/r1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('company_research')).toHaveLength(0);
    });

    it('returns 404 for missing entry', async () => {
      const res = await req('/research/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /research/summary/:lead_id', () => {
    it('returns category counts', async () => {
      mockD1.seed('company_research', [
        { id: 'r1', lead_id: 'lead1', category: 'company_overview', title: 'A', content: 'B', confidence: 'high', gathered_by: 'agent', created_at: '2026-01-01', updated_at: '2026-01-01' },
        { id: 'r2', lead_id: 'lead1', category: 'company_overview', title: 'C', content: 'D', confidence: 'high', gathered_by: 'agent', created_at: '2026-01-02', updated_at: '2026-01-02' },
        { id: 'r3', lead_id: 'lead1', category: 'key_people', title: 'E', content: 'F', confidence: 'medium', gathered_by: 'agent', created_at: '2026-01-03', updated_at: '2026-01-03' },
      ]);
      const res = await req('/research/summary/lead1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.total).toBe(3);
      expect(body.summary).toHaveLength(2);
    });
  });
});
