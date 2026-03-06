import { getSandbox, type SandboxOptions } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { ensureMoltbotGateway } from '../gateway';
import { sendSessionMessage } from '../gateway/rpc';

/**
 * Weekly review: summarize all project progress, identify issues, recommend focus.
 */
export async function weeklyReview(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running weekly review');

  const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';
  const options: SandboxOptions =
    sleepAfter === 'never' ? { keepAlive: true } : { sleepAfter };
  const sandbox = getSandbox(env.Sandbox, 'moltbot', options);
  await ensureMoltbotGateway(sandbox, env);

  const today = new Date().toISOString().split('T')[0];
  let reviewData: Record<string, unknown> = {};

  try {
    const [
      allProjects,
      weeklyCompleted,
      stalledProjects,
      oldBlockers,
      weekSnapshots,
    ] = await Promise.all([
      // All active projects with stats
      env.DB.prepare(
        `SELECT p.*, 
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','deferred')) as open_tasks,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as done_tasks,
          (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.status = 'open') as open_blockers
         FROM projects p WHERE p.status = 'active'
         ORDER BY CASE p.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),

      // Tasks completed this week
      env.DB.prepare(
        `SELECT t.title, p.name as project_name, t.completed_date
         FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.status = 'done' AND t.completed_date >= date(?, '-7 days')
         ORDER BY t.completed_date DESC`,
      ).bind(today).all(),

      // Stalled projects (no task updates in 5+ days)
      env.DB.prepare(
        `SELECT p.name, p.priority, MAX(t.updated_at) as last_task_update,
          CAST(julianday('now') - julianday(MAX(t.updated_at)) AS INTEGER) as days_stale
         FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.status = 'active'
         GROUP BY p.id
         HAVING days_stale >= 5 OR last_task_update IS NULL`,
      ).all(),

      // Blockers open 3+ days
      env.DB.prepare(
        `SELECT b.description, b.severity, p.name as project_name,
          CAST(julianday('now') - julianday(b.created_at) AS INTEGER) as days_open
         FROM blockers b LEFT JOIN projects p ON b.project_id = p.id
         WHERE b.status = 'open' AND julianday('now') - julianday(b.created_at) >= 3
         ORDER BY days_open DESC`,
      ).all(),

      // This week's snapshots for trending
      env.DB.prepare(
        `SELECT s.*, p.name as project_name
         FROM progress_snapshots s LEFT JOIN projects p ON s.project_id = p.id
         WHERE s.snapshot_date >= date(?, '-7 days')
         ORDER BY s.snapshot_date ASC`,
      ).bind(today).all(),
    ]);

    reviewData = {
      week_ending: today,
      projects: allProjects.results,
      completed_this_week: weeklyCompleted.results,
      stalled_projects: stalledProjects.results,
      old_blockers: oldBlockers.results,
      weekly_snapshots: weekSnapshots.results,
    };
  } catch (err) {
    console.error('[CRON] Weekly review query failed:', err);
    reviewData = { week_ending: today, error: 'Failed to query weekly data' };
  }

  const message = `[SYSTEM] Weekly review trigger for week ending ${today}. Here is the weekly data:\n\n${JSON.stringify(reviewData, null, 2)}\n\nGenerate a weekly review for Devon following SOUL.md rules: summarize per-project progress (% complete, health), identify slipping/stalled projects, flag blockers open 3+ days, recommend focus areas for next week, recommend what to pause/defer/cut. Be thorough but structured.`;

  const result = await sendSessionMessage(sandbox, message, env.MOLTBOT_GATEWAY_TOKEN);
  console.log('[CRON] Weekly review sent:', result.ok, result.status);

  try {
    await env.DB.prepare(
      `INSERT INTO daily_checkins (id, checkin_date, checkin_type, summary, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), today, 'weekly_review', 'Auto-generated weekly review', new Date().toISOString()).run();
  } catch (err) {
    console.error('[CRON] Check-in log failed:', err);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO agent_logs (id, action, details, source, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      'weekly_review_sent',
      JSON.stringify({ week_ending: today, gateway_response: result.status }),
      'cron',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[CRON] Agent log failed:', err);
  }
}
