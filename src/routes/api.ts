import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createAccessMiddleware } from '../auth';
import {
  ensureMoltbotGateway,
  findExistingMoltbotProcess,
  syncToR2,
  waitForProcess,
} from '../gateway';
import { projects } from './projects';
import { tasks } from './tasks';
import { goals, milestones } from './goals';
import { checkins, blockers } from './checkins';
import { dashboard } from './dashboard';
import { reminders } from './reminders';
import { agentLogs } from './agent-logs';
import { google } from './google';

// CLI commands can take 10-15 seconds to complete due to WebSocket connection overhead
const CLI_TIMEOUT_MS = 20000;

// Hard timeout for admin API sandbox interactions (prevents infinite hangs)
const ADMIN_GATEWAY_TIMEOUT_MS = 15000;
const ADMIN_EXEC_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

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
 * API routes
 * - /api/admin/* - Protected admin API routes (Cloudflare Access required)
 *
 * Note: /api/status is now handled by publicRoutes (no auth required)
 */
const api = new Hono<AppEnv>();

/**
 * Admin API routes - all protected by Cloudflare Access
 */
const adminApi = new Hono<AppEnv>();

// Middleware: Verify Cloudflare Access JWT for all admin routes
adminApi.use('*', createAccessMiddleware({ type: 'json' }));

// GET /api/admin/devices - List pending and paired devices
adminApi.get('/devices', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure moltbot is running first (with timeout to prevent infinite hang)
    await withTimeout(ensureMoltbotGateway(sandbox, c.env), ADMIN_GATEWAY_TIMEOUT_MS, 'Gateway startup');

    // Run OpenClaw CLI to list devices
    // Must specify --url and --token (OpenClaw v2026.2.3 requires explicit credentials with --url)
    const token = c.env.MOLTBOT_GATEWAY_TOKEN;
    const tokenArg = token ? ` --token ${token}` : '';
    const proc = await withTimeout(
      sandbox.startProcess(
        `openclaw devices list --json --url ws://localhost:18789${tokenArg}`,
      ),
      ADMIN_EXEC_TIMEOUT_MS,
      'Start CLI process',
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Try to parse JSON output
    try {
      // Find JSON in output (may have other log lines)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return c.json(data);
      }

      // If no JSON found, return raw output for debugging
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
      });
    } catch {
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
        parseError: 'Failed to parse CLI output',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/admin/devices/:requestId/approve - Approve a pending device
adminApi.post('/devices/:requestId/approve', async (c) => {
  const sandbox = c.get('sandbox');
  const requestId = c.req.param('requestId');

  if (!requestId) {
    return c.json({ error: 'requestId is required' }, 400);
  }

  try {
    // Ensure moltbot is running first (with timeout)
    await withTimeout(ensureMoltbotGateway(sandbox, c.env), ADMIN_GATEWAY_TIMEOUT_MS, 'Gateway startup');

    // Run OpenClaw CLI to approve the device
    const token = c.env.MOLTBOT_GATEWAY_TOKEN;
    const tokenArg = token ? ` --token ${token}` : '';
    const proc = await sandbox.startProcess(
      `openclaw devices approve ${requestId} --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Check for success indicators (case-insensitive, CLI outputs "Approved ...")
    const success = stdout.toLowerCase().includes('approved') || proc.exitCode === 0;

    return c.json({
      success,
      requestId,
      message: success ? 'Device approved' : 'Approval may have failed',
      stdout,
      stderr,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/admin/devices/approve-all - Approve all pending devices
adminApi.post('/devices/approve-all', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure moltbot is running first (with timeout)
    await withTimeout(ensureMoltbotGateway(sandbox, c.env), ADMIN_GATEWAY_TIMEOUT_MS, 'Gateway startup');

    // First, get the list of pending devices
    const token = c.env.MOLTBOT_GATEWAY_TOKEN;
    const tokenArg = token ? ` --token ${token}` : '';
    const listProc = await sandbox.startProcess(
      `openclaw devices list --json --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(listProc, CLI_TIMEOUT_MS);

    const listLogs = await listProc.getLogs();
    const stdout = listLogs.stdout || '';

    // Parse pending devices
    let pending: Array<{ requestId: string }> = [];
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        pending = data.pending || [];
      }
    } catch {
      return c.json({ error: 'Failed to parse device list', raw: stdout }, 500);
    }

    if (pending.length === 0) {
      return c.json({ approved: [], message: 'No pending devices to approve' });
    }

    // Approve each pending device
    const results: Array<{ requestId: string; success: boolean; error?: string }> = [];

    for (const device of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential device approval required
        const approveProc = await sandbox.startProcess(
          `openclaw devices approve ${device.requestId} --url ws://localhost:18789${tokenArg}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await waitForProcess(approveProc, CLI_TIMEOUT_MS);

        // eslint-disable-next-line no-await-in-loop
        const approveLogs = await approveProc.getLogs();
        const success =
          approveLogs.stdout?.toLowerCase().includes('approved') || approveProc.exitCode === 0;

        results.push({ requestId: device.requestId, success });
      } catch (err) {
        results.push({
          requestId: device.requestId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const approvedCount = results.filter((r) => r.success).length;
    return c.json({
      approved: results.filter((r) => r.success).map((r) => r.requestId),
      failed: results.filter((r) => !r.success),
      message: `Approved ${approvedCount} of ${pending.length} device(s)`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/admin/storage - Get R2 storage status and last sync time
adminApi.get('/storage', async (c) => {
  const sandbox = c.get('sandbox');
  const hasCredentials = !!(
    c.env.R2_ACCESS_KEY_ID &&
    c.env.R2_SECRET_ACCESS_KEY &&
    c.env.CF_ACCOUNT_ID
  );

  const missing: string[] = [];
  if (!c.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!c.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!c.env.CF_ACCOUNT_ID) missing.push('CF_ACCOUNT_ID');

  let lastSync: string | null = null;

  if (hasCredentials) {
    try {
      const result = await withTimeout(
        sandbox.exec('cat /tmp/.last-sync 2>/dev/null || echo ""'),
        ADMIN_EXEC_TIMEOUT_MS,
        'Storage status check',
      );
      const timestamp = result.stdout?.trim();
      if (timestamp && timestamp !== '') {
        lastSync = timestamp;
      }
    } catch {
      // Ignore errors checking sync status (includes timeouts)
    }
  }

  return c.json({
    configured: hasCredentials,
    missing: missing.length > 0 ? missing : undefined,
    lastSync,
    message: hasCredentials
      ? 'R2 storage is configured. Your data will persist across container restarts.'
      : 'R2 storage is not configured. Paired devices and conversations will be lost when the container restarts.',
  });
});

// POST /api/admin/storage/sync - Trigger a manual sync to R2
adminApi.post('/storage/sync', async (c) => {
  const sandbox = c.get('sandbox');

  const result = await syncToR2(sandbox, c.env);

  if (result.success) {
    return c.json({
      success: true,
      message: 'Sync completed successfully',
      lastSync: result.lastSync,
    });
  } else {
    const status = result.error?.includes('not configured') ? 400 : 500;
    return c.json(
      {
        success: false,
        error: result.error,
        details: result.details,
      },
      status,
    );
  }
});

// POST /api/admin/gateway/restart - Kill the current gateway and start a new one
adminApi.post('/gateway/restart', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Find and kill the existing gateway process (with timeout)
    const existingProcess = await withTimeout(
      findExistingMoltbotProcess(sandbox),
      ADMIN_EXEC_TIMEOUT_MS,
      'Process lookup',
    );

    if (existingProcess) {
      console.log('Killing existing gateway process:', existingProcess.id);
      try {
        await existingProcess.kill();
      } catch (killErr) {
        console.error('Error killing process:', killErr);
      }
      // Wait a moment for the process to die
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Start a new gateway in the background
    const bootPromise = ensureMoltbotGateway(sandbox, c.env).catch((err) => {
      console.error('Gateway restart failed:', err);
    });
    c.executionCtx.waitUntil(bootPromise);

    return c.json({
      success: true,
      message: existingProcess
        ? 'Gateway process killed, new instance starting...'
        : 'No existing process found, starting new instance...',
      previousProcessId: existingProcess?.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/leads - Upsert a lead to the D1 database (keyed by domain)
api.post('/leads', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const data = body as Record<string, unknown>;
    const website = (data.website ?? '').toString();
    const domain = normalizeDomain((data.domain ?? website).toString());
    if (!domain) {
      return c.json({ error: 'domain or website required' }, 400);
    }

    const now = new Date().toISOString();
    const id = (data.id ?? crypto.randomUUID()).toString();

    const row = {
      id,
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
      created_at: now,
      updated_at: now,
    };

    await c.env.DB.prepare(
      `INSERT INTO leads (
        id, domain, business_name, website, phone, email, city, state, category,
        owner_or_people, linkedin_company, linkedin_people, contact_page_url, source_urls,
        evidence_snippet, match_score, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
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
        updated_at=excluded.updated_at`,
    )
      .bind(
        row.id,
        row.domain,
        row.business_name,
        row.website,
        row.phone,
        row.email,
        row.city,
        row.state,
        row.category,
        row.owner_or_people,
        row.linkedin_company,
        row.linkedin_people,
        row.contact_page_url,
        row.source_urls,
        row.evidence_snippet,
        row.match_score,
        row.notes,
        row.created_at,
        row.updated_at,
      )
      .run();

    return c.json({ ok: true, domain: row.domain });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[leads] Failed to save lead:', errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/export.csv - Download all leads as CSV
api.get('/export.csv', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
        domain, business_name, website, phone, email, city, state, category,
        owner_or_people, linkedin_company, linkedin_people, contact_page_url,
        source_urls, evidence_snippet, match_score, notes, created_at, updated_at
       FROM leads
       ORDER BY COALESCE(match_score, 0) DESC, updated_at DESC`,
    ).all();

    const headers = [
      'domain',
      'business_name',
      'website',
      'phone',
      'email',
      'city',
      'state',
      'category',
      'owner_or_people',
      'linkedin_company',
      'linkedin_people',
      'contact_page_url',
      'source_urls',
      'evidence_snippet',
      'match_score',
      'notes',
      'created_at',
      'updated_at',
    ];

    const lines = [headers.join(',')];
    for (const r of results as Record<string, unknown>[]) {
      lines.push(headers.map((h) => toCsvValue(r[h])).join(','));
    }

    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads.csv"',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[export] Failed to export leads:', errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

// Mount admin API routes under /admin
api.route('/admin', adminApi);

// Mount executive assistant routes
api.route('/projects', projects);
api.route('/tasks', tasks);
api.route('/goals', goals);
api.route('/milestones', milestones);
api.route('/checkins', checkins);
api.route('/blockers', blockers);
api.route('/dashboard', dashboard);
api.route('/reminders', reminders);
api.route('/agent-logs', agentLogs);
api.route('/google', google);

export { api };
