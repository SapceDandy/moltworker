import { getSandbox, type SandboxOptions } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { MOLTBOT_PORT } from '../config';
import { ensureMoltbotGateway } from '../gateway';
import { sendSessionMessage } from '../gateway/rpc';
import { fetchCalendarEventsForCron } from './google-helpers';

/**
 * Morning brief: query dashboard, take snapshot, and send brief to OpenClaw session.
 */
export async function morningBrief(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running morning brief');

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

    dashboardData = {
      date: today,
      active_projects: activeProjects.results,
      overdue_tasks: overdueTasks.results,
      today_tasks: todayTasks.results,
      open_blockers: openBlockers.results,
      due_reminders: dueReminders.results,
      calendar_events: calendarEvents.length > 0 ? calendarEvents : undefined,
    };
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

  // Send to OpenClaw session
  const calendarNote = (dashboardData as Record<string, unknown>).calendar_events ? ' Include calendar events in schedule awareness — flag conflicts between meetings and deep work blocks.' : '';
  const message = `[SYSTEM] Morning brief trigger for ${today}. Here is today's dashboard data:\n\n${JSON.stringify(dashboardData, null, 2)}\n\nGenerate a concise morning brief for Devon following SOUL.md rules: top 3-5 priorities, overdue items, open blockers, nearest deadlines, and any due reminders.${calendarNote} Keep it under 15 lines.`;

  const result = await sendSessionMessage(sandbox, message, env.MOLTBOT_GATEWAY_TOKEN);
  console.log('[CRON] Morning brief sent:', result.ok, result.status);

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
