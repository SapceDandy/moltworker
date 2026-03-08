import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { leads } from './leads';
import { createMockEnv, suppressConsole } from '../test-utils';
import { createMockD1 } from '../test-utils-d1';
import type { AppEnv, MoltbotEnv } from '../types';

describe('leads routes', () => {
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
    app.route('/leads', leads);
    env = createMockEnv({ DB: mockD1.db });
  });

  describe('POST /leads', () => {
    it('creates a lead with domain', async () => {
      const res = await req('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'example.com', business_name: 'Example Corp' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.domain).toBe('example.com');

      const rows = mockD1.getAll('leads');
      expect(rows).toHaveLength(1);
      expect(rows[0].business_name).toBe('Example Corp');
    });

    it('creates a lead from website URL', async () => {
      const res = await req('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: 'https://www.test.com/about' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.domain).toBe('test.com');
    });

    it('returns 400 for missing domain', async () => {
      const res = await req('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: 'No Domain' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await req('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /leads', () => {
    it('returns empty list when no leads exist', async () => {
      const res = await req('/leads');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.leads).toEqual([]);
    });

    it('returns seeded leads', async () => {
      mockD1.seed('leads', [
        { id: 'l1', domain: 'a.com', business_name: 'A Corp', match_score: 90, updated_at: '2026-01-01', lead_status: 'new' },
        { id: 'l2', domain: 'b.com', business_name: 'B Corp', match_score: 50, updated_at: '2026-01-02', lead_status: 'contacted' },
      ]);
      const res = await req('/leads');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.leads).toHaveLength(2);
    });

    it('filters by state', async () => {
      mockD1.seed('leads', [
        { id: 'l1', domain: 'a.com', state: 'TX', match_score: 80, updated_at: '2026-01-01' },
        { id: 'l2', domain: 'b.com', state: 'CA', match_score: 60, updated_at: '2026-01-02' },
      ]);
      const res = await req('/leads?state=TX');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.leads).toHaveLength(1);
      expect(body.leads[0].domain).toBe('a.com');
    });
  });

  describe('GET /leads/:id', () => {
    it('returns a lead by id', async () => {
      mockD1.seed('leads', [
        { id: 'l1', domain: 'a.com', business_name: 'A Corp' },
      ]);
      const res = await req('/leads/l1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.lead.domain).toBe('a.com');
    });

    it('returns 404 for non-existent lead', async () => {
      const res = await req('/leads/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /leads/:id', () => {
    it('updates lead fields', async () => {
      mockD1.seed('leads', [
        { id: 'l1', domain: 'a.com', business_name: 'Old Name', lead_status: 'new' },
      ]);
      const res = await req('/leads/l1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: 'New Name', lead_status: 'contacted' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    });

    it('returns 404 for non-existent lead', async () => {
      const res = await req('/leads/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: 'Nope' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for no fields', async () => {
      mockD1.seed('leads', [
        { id: 'l1', domain: 'a.com' },
      ]);
      const res = await req('/leads/l1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /leads/:id', () => {
    it('deletes an existing lead', async () => {
      mockD1.seed('leads', [
        { id: 'l1', domain: 'a.com' },
      ]);
      const res = await req('/leads/l1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockD1.getAll('leads')).toHaveLength(0);
    });

    it('returns 404 for non-existent lead', async () => {
      const res = await req('/leads/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /leads/import', () => {
    it('imports CSV with domain column', async () => {
      const csv = 'domain,business_name,city,state\nexample.com,Example Corp,Austin,TX\ntest.com,Test Inc,Dallas,TX';
      const res = await req('/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.imported).toBe(2);
      expect(body.skipped).toBe(0);
      expect(mockD1.getAll('leads')).toHaveLength(2);
    });

    it('imports CSV with website column', async () => {
      const csv = 'website,business_name\nhttps://www.example.com,Example Corp';
      const res = await req('/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.imported).toBe(1);
    });

    it('returns 400 for empty CSV', async () => {
      const res = await req('/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: '',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for CSV without domain column', async () => {
      const csv = 'name,city\nFoo,Austin';
      const res = await req('/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });
      expect(res.status).toBe(400);
    });

    it('skips rows without domain', async () => {
      const csv = 'domain,business_name\nexample.com,Good\n,Bad';
      const res = await req('/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.imported).toBe(1);
      expect(body.skipped).toBe(1);
    });
  });
});
