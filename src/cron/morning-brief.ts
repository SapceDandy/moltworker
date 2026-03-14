import type { MoltbotEnv } from '../types';
import { generateCronBrief } from '../gateway/rpc';
import { fetchCalendarEventsForCron } from './google-helpers';
import { sendDiscordDM } from './discord';

/**
 * Morning brief: query dashboard, take snapshot, and send brief to OpenClaw session.
 */
export async function morningBrief(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running morning brief');
  const today = new Date().toISOString().split('T')[0];

  try {
    await _morningBriefInner(env, today);
  } catch (err) {
    console.error('[CRON] Morning brief top-level crash:', err);
    // Guarantee Discord DM even on total crash
    if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await sendDiscordDM(
          env.DISCORD_BOT_TOKEN,
          env.DISCORD_OWNER_USER_ID,
          `🔥 **Morning Brief — ${today}**\n\nCritical crash: ${errMsg}\n\nCheck worker logs with \`wrangler tail\`.`,
        );
      } catch (dmErr) {
        console.error('[CRON] Crash DM also failed:', dmErr);
      }
    }
  }
}

async function _morningBriefInner(env: MoltbotEnv, today: string): Promise<void> {
  // Check active projects — skip AI call but still send DM
  const projectCount = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM projects WHERE status = 'active'",
  ).first<{ c: number }>();
  if (!projectCount?.c) {
    console.log('[CRON] No active projects, sending info DM');
    if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
      await sendDiscordDM(
        env.DISCORD_BOT_TOKEN,
        env.DISCORD_OWNER_USER_ID,
        `☀️ **Morning Brief — ${today}**\n\nNo active projects found. Create a project in the dashboard to start getting daily briefs.`,
      );
    }
    return;
  }

  // Fetch dashboard data from the Worker's own D1 database
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

    // Fetch sales cadence data
    let dueTouches: Record<string, unknown>[] = [];
    let cadenceSummary: Record<string, unknown> | null = null;
    let stalledCadences: Record<string, unknown>[] = [];
    try {
      const [touchesRes, summaryRes, stalledRes] = await Promise.all([
        env.DB.prepare(
          `SELECT tl.id, tl.touch_type, tl.scheduled_at, ps.name as stage_name, ps.stage_type, ps.framework,
           l.business_name, l.domain
           FROM touch_log tl
           JOIN sales_cadences sc ON tl.cadence_id = sc.id
           LEFT JOIN leads l ON sc.lead_id = l.id
           LEFT JOIN pipeline_stages ps ON tl.stage_id = ps.id
           WHERE tl.status = 'scheduled' AND tl.scheduled_at <= ? AND sc.status = 'active'
           ORDER BY tl.scheduled_at ASC LIMIT 20`,
        ).bind(today).all(),
        env.DB.prepare(
          `SELECT
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
            SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
           FROM sales_cadences`,
        ).first(),
        env.DB.prepare(
          `SELECT sc.id, l.business_name, l.domain, ps.name as stage_name, sc.last_touch_at
           FROM sales_cadences sc
           LEFT JOIN leads l ON sc.lead_id = l.id
           LEFT JOIN pipeline_stages ps ON sc.current_stage_id = ps.id
           WHERE sc.status = 'active' AND (sc.last_touch_at IS NULL OR sc.last_touch_at < datetime('now', '-5 days'))
           LIMIT 10`,
        ).all(),
      ]);
      dueTouches = touchesRes.results as Record<string, unknown>[];
      cadenceSummary = summaryRes;
      stalledCadences = stalledRes.results as Record<string, unknown>[];
    } catch (err) {
      console.error('[CRON] Cadence query failed:', err);
    }

    // Build payload, omitting empty arrays to reduce token count
    dashboardData = { date: today } as Record<string, unknown>;
    if (activeProjects.results.length) dashboardData.active_projects = activeProjects.results;
    if (overdueTasks.results.length) dashboardData.overdue_tasks = overdueTasks.results;
    if (todayTasks.results.length) dashboardData.today_tasks = todayTasks.results;
    if (openBlockers.results.length) dashboardData.open_blockers = openBlockers.results;
    if (dueReminders.results.length) dashboardData.due_reminders = dueReminders.results;
    if (calendarEvents.length) dashboardData.calendar_events = calendarEvents;
    if (dueTouches.length) dashboardData.sales_due_touches = dueTouches;
    if (cadenceSummary) dashboardData.sales_summary = cadenceSummary;
    if (stalledCadences.length) dashboardData.sales_stalled = stalledCadences;
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

  // Generate brief via direct Anthropic Haiku call (bypasses OpenClaw system prompt)
  const calendarNote = dashboardData.calendar_events ? ' Flag calendar conflicts.' : '';
  const salesNote = dashboardData.sales_due_touches ? ' Include sales outreach due today (calls, emails, LinkedIn touches). Flag stalled cadences.' : '';
  const message = `Morning brief for ${today}. Generate top 3-5 priorities, overdue items, open blockers, nearest deadlines, and due reminders.${calendarNote}${salesNote}\nData:\n${JSON.stringify(dashboardData)}`;

  const result = await generateCronBrief(message, env);
  console.log('[CRON] Morning brief generated:', result.ok);

  // Forward to Discord DM if configured — always send, even on failure
  let discordSent = false;
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
    try {
      const dmText = result.ok && result.text
        ? `☀️ **Morning Brief — ${today}**\n\n${result.text}`
        : `⚠️ **Morning Brief — ${today}**\n\nBrief generation failed: ${result.text || 'unknown error'}\n\nCheck the dashboard for task details.`;
      discordSent = await sendDiscordDM(env.DISCORD_BOT_TOKEN, env.DISCORD_OWNER_USER_ID, dmText);
      console.log('[CRON] Morning brief Discord DM:', discordSent ? 'sent' : 'failed');
    } catch (err) {
      console.error('[CRON] Discord DM failed:', err);
    }
  } else {
    console.warn('[CRON] Discord DM skipped: DISCORD_BOT_TOKEN or DISCORD_OWNER_USER_ID not set');
  }

  // Auto-create reminders for upcoming deadlines (best-effort, zero LLM cost)
  try {
    await autoCreateReminders(env, today);
  } catch (err) {
    console.error('[CRON] Auto-reminder creation failed:', err);
  }

  // Log the check-in (store actual brief text for dashboard visibility)
  try {
    const summary = result.ok ? result.text : `[FAILED] ${result.text}`;
    await env.DB.prepare(
      `INSERT INTO daily_checkins (id, checkin_date, checkin_type, summary, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), today, 'morning_brief', summary.slice(0, 4000), new Date().toISOString()).run();
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
      JSON.stringify({ date: today, haiku_ok: result.ok, discord_sent: discordSent, error: result.ok ? undefined : result.text }),
      'cron',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[CRON] Agent log failed:', err);
  }
}


/**
 * Auto-create reminders for tasks with upcoming deadlines and project target dates.
 * Only creates reminders that don't already exist (deduplicates by related_task_id or related_project_id).
 */
async function autoCreateReminders(env: MoltbotEnv, today: string): Promise<void> {
  const now = new Date().toISOString();
  const threeDaysOut = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  let created = 0;

  // 1. Tasks with deadlines in the next 3 days that don't have a pending reminder
  const { results: upcomingTasks } = await env.DB.prepare(
    `SELECT t.id, t.title, t.deadline, t.priority, p.name as project_name
     FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.deadline >= ? AND t.deadline <= ?
       AND t.status NOT IN ('done', 'deferred')
       AND t.id NOT IN (
         SELECT related_task_id FROM reminders
         WHERE related_task_id IS NOT NULL AND status = 'pending'
       )
     ORDER BY t.deadline ASC`,
  ).bind(today, threeDaysOut).all<{ id: string; title: string; deadline: string; priority: string; project_name: string | null }>();

  for (const task of upcomingTasks) {
    const daysUntil = Math.ceil((new Date(task.deadline).getTime() - Date.now()) / 86400000);
    const label = daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
    const project = task.project_name ? ` (${task.project_name})` : '';
    // Set reminder for 8 AM on the deadline day (or today if deadline is today/past)
    const remindDate = daysUntil <= 0 ? today : task.deadline;
    await env.DB.prepare(
      `INSERT INTO reminders (id, title, description, remind_at, status, related_task_id, recurrence, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?)`,
    ).bind(
      crypto.randomUUID(),
      `📋 ${task.title} — due ${label}`,
      `Task deadline ${label}${project}. Priority: ${task.priority}.`,
      `${remindDate}T13:00:00Z`,
      task.id,
      now,
    ).run();
    created++;
  }

  // 2. Projects with target dates in the next 7 days that don't have a pending reminder
  const { results: upcomingProjects } = await env.DB.prepare(
    `SELECT p.id, p.name, p.target_date, p.priority, p.percent_complete
     FROM projects p
     WHERE p.status = 'active' AND p.target_date IS NOT NULL
       AND p.target_date >= ? AND p.target_date <= ?
       AND p.id NOT IN (
         SELECT related_project_id FROM reminders
         WHERE related_project_id IS NOT NULL AND status = 'pending'
       )
     ORDER BY p.target_date ASC`,
  ).bind(today, sevenDaysOut).all<{ id: string; name: string; target_date: string; priority: string; percent_complete: number }>();

  for (const project of upcomingProjects) {
    const daysUntil = Math.ceil((new Date(project.target_date).getTime() - Date.now()) / 86400000);
    const label = daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
    await env.DB.prepare(
      `INSERT INTO reminders (id, title, description, remind_at, status, related_project_id, recurrence, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?)`,
    ).bind(
      crypto.randomUUID(),
      `🎯 ${project.name} target date — ${label}`,
      `Project target date ${label}. Currently ${project.percent_complete}% complete. Priority: ${project.priority}.`,
      `${project.target_date}T13:00:00Z`,
      project.id,
      now,
    ).run();
    created++;
  }

  // 3. Overdue tasks without a reminder — create a follow-up
  const { results: overdueTasks } = await env.DB.prepare(
    `SELECT t.id, t.title, t.deadline, p.name as project_name
     FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.deadline < ? AND t.status NOT IN ('done', 'deferred')
       AND t.id NOT IN (
         SELECT related_task_id FROM reminders
         WHERE related_task_id IS NOT NULL AND status = 'pending'
       )
     ORDER BY t.deadline ASC LIMIT 10`,
  ).bind(today).all<{ id: string; title: string; deadline: string; project_name: string | null }>();

  for (const task of overdueTasks) {
    const project = task.project_name ? ` (${task.project_name})` : '';
    await env.DB.prepare(
      `INSERT INTO reminders (id, title, description, remind_at, status, related_task_id, recurrence, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?)`,
    ).bind(
      crypto.randomUUID(),
      `🚨 Overdue: ${task.title}`,
      `Task was due ${task.deadline}${project}. Needs attention or rescheduling.`,
      `${today}T13:00:00Z`,
      task.id,
      now,
    ).run();
    created++;
  }

  if (created > 0) {
    console.log(`[CRON] Auto-created ${created} reminders`);
  }
}
