import { getSandbox, type SandboxOptions } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { MOLTBOT_PORT } from '../config';
import { ensureMoltbotGateway } from '../gateway';
import { sendSessionMessage } from '../gateway/rpc';
import { fetchCalendarEventsForCron } from './google-helpers';
import { sendDiscordDM, extractAssistantReply } from './discord';

/**
 * Morning brief: query dashboard, take snapshot, and send brief to OpenClaw session.
 */
export async function morningBrief(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running morning brief');

  // Skip if no active projects — avoids booting sandbox + Claude API call
  const projectCount = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM projects WHERE status = 'active'",
  ).first<{ c: number }>();
  if (!projectCount?.c) {
    console.log('[CRON] No active projects, skipping morning brief');
    return;
  }

  const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';
  const options: SandboxOptions =
    sleepAfter === 'never' ? { keepAlive: true } : { sleepAfter };
  const sandbox = getSandbox(env.Sandbox, 'moltbot', options);
  await ensureMoltbotGateway(sandbox, env);

  // Fetch dashboard data from the Worker's own D1 database
  const today = new Date().toISOString().split('T')[0];
  let dashboardData: Record<string, unknown> = {};

  try {
    const [
      activeProjects,
      overdueTasks,
      todayTasks,
      openBlockers,
      dueReminders,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT p.name, p.priority, p.health, p.percent_complete, p.target_date,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','deferred')) as open_tasks,
          (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.status = 'open') as blocker_count
         FROM projects p WHERE p.status = 'active'
         ORDER BY CASE p.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),
      env.DB.prepare(
        `SELECT t.title, t.deadline, t.priority, p.name as project_name
         FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.deadline < ? AND t.status NOT IN ('done','deferred')
         ORDER BY t.deadline ASC LIMIT 10`,
      ).bind(today).all(),
      env.DB.prepare(
        `SELECT t.title, t.priority, p.name as project_name
         FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.deadline = ? AND t.status NOT IN ('done','deferred')
         ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).bind(today).all(),
      env.DB.prepare(
        `SELECT b.description, b.severity, p.name as project_name,
          CAST(julianday('now') - julianday(b.created_at) AS INTEGER) as days_open
         FROM blockers b LEFT JOIN projects p ON b.project_id = p.id
         WHERE b.status = 'open'
         ORDER BY CASE b.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),
      env.DB.prepare(
        `SELECT r.title, r.description, r.remind_at, r.recurrence,
          p.name as project_name, t.title as task_title
         FROM reminders r
         LEFT JOIN projects p ON r.related_project_id = p.id
         LEFT JOIN tasks t ON r.related_task_id = t.id
         WHERE r.status = 'pending' AND r.remind_at <= datetime(?, '+24 hours')
         ORDER BY r.remind_at ASC`,
      ).bind(today + 'T00:00:00Z').all(),
    ]);

    // Fetch Google Calendar events for today (if configured)
    let calendarEvents: Array<Record<string, unknown>> = [];
    try {
      calendarEvents = await fetchCalendarEventsForCron(env, today);
    } catch (err) {
      console.error('[CRON] Calendar events fetch failed:', err);
    }

    // Build payload, omitting empty arrays to reduce token count
    dashboardData = { date: today } as Record<string, unknown>;
    if (activeProjects.results.length) dashboardData.active_projects = activeProjects.results;
    if (overdueTasks.results.length) dashboardData.overdue_tasks = overdueTasks.results;
    if (todayTasks.results.length) dashboardData.today_tasks = todayTasks.results;
    if (openBlockers.results.length) dashboardData.open_blockers = openBlockers.results;
    if (dueReminders.results.length) dashboardData.due_reminders = dueReminders.results;
    if (calendarEvents.length) dashboardData.calendar_events = calendarEvents;
  } catch (err) {
    console.error('[CRON] Dashboard query failed:', err);
    dashboardData = { date: today, error: 'Failed to query dashboard' };
  }

  // Take daily snapshot
  try {
    const { results: snapProjects } = await env.DB.prepare(
      `SELECT p.id, p.percent_complete, p.health,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','deferred')) as open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as completed_tasks,
        (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.status = 'open') as open_blockers
       FROM projects p WHERE p.status = 'active'`,
    ).all();

    const now = new Date().toISOString();
    const batch: D1PreparedStatement[] = [];
    for (const p of snapProjects as Array<Record<string, unknown>>) {
      batch.push(
        env.DB.prepare(
          `INSERT INTO progress_snapshots (id, snapshot_date, project_id, percent_complete, open_tasks, completed_tasks, open_blockers, health, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), today, p.id, p.percent_complete, p.open_tasks, p.completed_tasks, p.open_blockers, p.health, now),
      );
    }
    if (batch.length > 0) {
      await env.DB.batch(batch);
    }
    console.log('[CRON] Snapshot taken for', batch.length, 'projects');
  } catch (err) {
    console.error('[CRON] Snapshot failed:', err);
  }

  // Send to OpenClaw session (compact JSON to reduce token cost; SOUL.md has full brief rules)
  const calendarNote = dashboardData.calendar_events ? ' Flag calendar conflicts.' : '';
  const message = `[SYSTEM] Morning brief for ${today}.\n${JSON.stringify(dashboardData)}\nFollow SOUL.md morning brief rules.${calendarNote}`;

  const result = await sendSessionMessage(sandbox, message, env.MOLTBOT_GATEWAY_TOKEN);
  console.log('[CRON] Morning brief sent:', result.ok, result.status);

  // Forward to Discord DM if configured
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
    try {
      const reply = extractAssistantReply(result.body);
      if (reply) {
        const sent = await sendDiscordDM(env.DISCORD_BOT_TOKEN, env.DISCORD_OWNER_USER_ID, reply);
        console.log('[CRON] Morning brief Discord DM:', sent ? 'sent' : 'failed');
      } else {
        console.warn('[CRON] No assistant reply to forward to Discord');
      }
    } catch (err) {
      console.error('[CRON] Discord DM failed:', err);
    }
  }

  // Log the check-in
  try {
    await env.DB.prepare(
      `INSERT INTO daily_checkins (id, checkin_date, checkin_type, summary, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), today, 'morning_brief', 'Auto-generated morning brief', new Date().toISOString()).run();
  } catch (err) {
    console.error('[CRON] Check-in log failed:', err);
  }

  // Log agent action
  try {
    await env.DB.prepare(
      `INSERT INTO agent_logs (id, action, details, source, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      'morning_brief_sent',
      JSON.stringify({ date: today, gateway_response: result.status }),
      'cron',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[CRON] Agent log failed:', err);
  }
}
