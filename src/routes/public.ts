import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { MOLTBOT_PORT } from '../config';
import { findExistingMoltbotProcess } from '../gateway';

/**
 * Public routes - NO Cloudflare Access authentication required
 *
 * These routes are mounted BEFORE the auth middleware is applied.
 * Includes: health checks, static assets, and public API endpoints.
 */
const publicRoutes = new Hono<AppEnv>();

// GET /sandbox-health - Health check endpoint
publicRoutes.get('/sandbox-health', (c) => {
  return c.json({
    status: 'ok',
    service: 'moltbot-sandbox',
    gateway_port: MOLTBOT_PORT,
  });
});

// GET /logo.png - Serve logo from ASSETS binding
publicRoutes.get('/logo.png', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// GET /logo-small.png - Serve small logo from ASSETS binding
publicRoutes.get('/logo-small.png', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// GET /api/status - Public health check for gateway status (no auth required)
// Includes diagnostic info: all container processes and their statuses
publicRoutes.get('/api/status', async (c) => {
  const sandbox = c.get('sandbox');
  const diag: Record<string, unknown> = {};

  try {
    // List ALL processes (including dead ones) for diagnostics
    let allProcesses: Array<{ id: string; command: string; status: string }> = [];
    try {
      const procs = await sandbox.listProcesses();
      allProcesses = procs.map((p: any) => ({
        id: p.id,
        command: p.command?.substring(0, 100),
        status: p.status,
      }));
      diag.processes = allProcesses;
      diag.processCount = allProcesses.length;
    } catch (listErr) {
      diag.listError = listErr instanceof Error ? listErr.message : 'Failed to list processes';
    }

    const process = await findExistingMoltbotProcess(sandbox);
    if (!process) {
      // Try to find any gateway-like process in any state for diagnostics
      const deadGateway = allProcesses.find(
        (p) =>
          (p.command?.includes('start-openclaw') || p.command?.includes('openclaw gateway')) &&
          p.status !== 'running' &&
          p.status !== 'starting',
      );
      if (deadGateway) {
        diag.deadGateway = deadGateway;
      }
      return c.json({ ok: false, status: 'not_running', ...diag });
    }

    // Process exists, check if it's actually responding
    try {
      await process.waitForPort(18789, { mode: 'tcp', timeout: 5000 });
      return c.json({ ok: true, status: 'running', processId: process.id, ...diag });
    } catch {
      // Try to get logs from the non-responding process
      try {
        const logs = await process.getLogs();
        diag.gatewayStdout = logs.stdout?.substring(0, 500);
        diag.gatewayStderr = logs.stderr?.substring(0, 500);
      } catch { /* ignore */ }
      return c.json({ ok: false, status: 'not_responding', processId: process.id, ...diag });
    }
  } catch (err) {
    return c.json({
      ok: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
      ...diag,
    });
  }
});

// GET /api/status/diag - Run individual diagnostic commands inside the container
publicRoutes.get('/api/status/diag', async (c) => {
  const sandbox = c.get('sandbox');
  const results: Record<string, unknown> = {};

  const commands = [
    { name: 'node_version', cmd: 'node --version' },
    { name: 'openclaw_version', cmd: 'openclaw --version 2>&1 || echo FAIL' },
    { name: 'config_exists', cmd: 'ls -la /root/.openclaw/openclaw.json 2>&1 || echo NO_CONFIG' },
    { name: 'config_head', cmd: 'head -c 500 /root/.openclaw/openclaw.json 2>/dev/null || echo EMPTY' },
    { name: 'config_discord', cmd: "node -e \"const fs=require('fs');const c=JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json','utf8'));console.log(JSON.stringify(c.channels?.discord ?? null, null, 2));\" 2>&1 || echo NO_DISCORD" },
    { name: 'skills_list', cmd: 'ls /root/clawd/skills/ 2>&1 || echo NO_SKILLS' },
    { name: 'workspace_list', cmd: 'ls /root/clawd/ 2>&1 || echo NO_WORKSPACE' },
    { name: 'disk_space', cmd: 'df -h / 2>&1' },
    { name: 'memory', cmd: 'free -m 2>&1 || echo N/A' },
    { name: 'rclone_conf', cmd: 'cat /root/.config/rclone/rclone.conf 2>/dev/null | head -3 || echo NO_RCLONE' },
    { name: 'last_sync', cmd: 'cat /tmp/.last-sync 2>/dev/null || echo NO_SYNC' },
    { name: 'process_list', cmd: 'ps aux 2>&1 || echo N/A' },
  ];

  for (const { name, cmd } of commands) {
    try {
      const r = await sandbox.exec(cmd);
      results[name] = { stdout: r.stdout?.substring(0, 800), exitCode: r.exitCode };
    } catch (e) {
      results[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return c.json(results);
});

// GET /api/status/boot - Diagnostic: attempt to boot the gateway and report step-by-step results
// This is temporary for debugging container startup issues
publicRoutes.get('/api/status/boot', async (c) => {
  const sandbox = c.get('sandbox');
  const steps: Array<{ step: string; ok: boolean; ms: number; detail?: string }> = [];

  function logStep(step: string, ok: boolean, ms: number, detail?: string) {
    steps.push({ step, ok, ms, detail: detail?.substring(0, 300) });
  }

  let t = Date.now();

  // Step 1: List processes
  try {
    const procs = await sandbox.listProcesses();
    logStep('listProcesses', true, Date.now() - t, `Found ${procs.length} processes`);
  } catch (e) {
    logStep('listProcesses', false, Date.now() - t, e instanceof Error ? e.message : String(e));
    return c.json({ steps });
  }

  // Step 2: Try to start the gateway script
  t = Date.now();
  let proc: any;
  try {
    const { buildEnvVars } = await import('../gateway/env');
    const envVars = buildEnvVars(c.env);
    logStep('buildEnvVars', true, Date.now() - t, `${Object.keys(envVars).length} vars`);

    t = Date.now();
    proc = await sandbox.startProcess('/usr/local/bin/start-openclaw.sh', {
      env: Object.keys(envVars).length > 0 ? envVars : undefined,
    });
    logStep('startProcess', true, Date.now() - t, `pid=${proc.id} status=${proc.status}`);
  } catch (e) {
    logStep('startProcess', false, Date.now() - t, e instanceof Error ? e.message : String(e));
    return c.json({ steps });
  }

  // Step 3: Wait for port (90s timeout for full cold-start diagnostics)
  t = Date.now();
  try {
    await proc.waitForPort(MOLTBOT_PORT, { mode: 'tcp', timeout: 90000 });
    logStep('waitForPort', true, Date.now() - t, 'Gateway is reachable');
  } catch (e) {
    logStep('waitForPort', false, Date.now() - t, e instanceof Error ? e.message : String(e));

    // Get logs from the process (capture more output to find crash)
    try {
      const logs = await proc.getLogs();
      const stdout = logs.stdout || '';
      const stderr = logs.stderr || '';
      logStep('stdout', proc.status === 'running', 0, stdout.substring(0, 1500));
      if (stderr) {
        logStep('stderr', false, 0, stderr.substring(0, 1500));
      }
      logStep('processStatus', proc.status === 'running', 0, `status=${proc.status} exitCode=${proc.exitCode}`);
    } catch (logErr) {
      logStep('processLogs', false, 0, logErr instanceof Error ? logErr.message : String(logErr));
    }
  }

  return c.json({ steps });
});

// GET /api/status/discord - Check Discord channel connectivity and pairing status
publicRoutes.get('/api/status/discord', async (c) => {
  const sandbox = c.get('sandbox');
  const results: Record<string, unknown> = {};

  // Check channel status
  try {
    const probe = await sandbox.exec('timeout 20 openclaw channels status --probe 2>&1 || echo TIMEOUT');
    results.channelStatus = probe.stdout?.substring(0, 1500) || '';
    results.channelStatusExit = probe.exitCode;
  } catch (e) {
    results.channelStatus = e instanceof Error ? e.message : String(e);
  }

  // List pending pairing codes
  try {
    const pairing = await sandbox.exec('timeout 20 openclaw pairing list discord 2>&1 || echo TIMEOUT');
    results.pairingList = pairing.stdout?.substring(0, 1000) || '';
    results.pairingListExit = pairing.exitCode;
  } catch (e) {
    results.pairingList = e instanceof Error ? e.message : String(e);
  }

  return c.json(results);
});

// POST /api/status/pairing-approve - Approve a Discord pairing code
publicRoutes.post('/api/status/pairing-approve', async (c) => {
  const sandbox = c.get('sandbox');
  const body = await c.req.json<{ code: string }>().catch(() => null);
  if (!body?.code) {
    return c.json({ error: 'Missing "code" in request body' }, 400);
  }

  try {
    const result = await sandbox.exec(`timeout 20 openclaw pairing approve discord ${body.code} 2>&1`);
    return c.json({
      stdout: result.stdout?.substring(0, 500) || '',
      exitCode: result.exitCode,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// GET /_admin/assets/* - Admin UI static assets (CSS, JS need to load for login redirect)
// Assets are built to dist/client with base "/_admin/"
publicRoutes.get('/_admin/assets/*', async (c) => {
  const url = new URL(c.req.url);
  // Rewrite /_admin/assets/* to /assets/* for the ASSETS binding
  const assetPath = url.pathname.replace('/_admin/assets/', '/assets/');
  const assetUrl = new URL(assetPath, url.origin);
  return c.env.ASSETS.fetch(new Request(assetUrl.toString(), c.req.raw));
});

export { publicRoutes };
