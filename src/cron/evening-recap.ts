import type { MoltbotEnv } from '../types';
import { generateCronBrief } from '../gateway/rpc';
import { fetchCalendarEventsForCron } from './google-helpers';
import { sendDiscordDM } from './discord';

/**
 * Evening recap: summarize the day's progress and prompt for updates.
 */
export async function eveningRecap(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running evening recap');
  const today = new Date().toISOString().split('T')[0];

  try {
    await _eveningRecapInner(env, today);
  } catch (err) {
    console.error('[CRON] Evening recap top-level crash:', err);
    if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await sendDiscordDM(
          env.DISCORD_BOT_TOKEN,
          env.DISCORD_OWNER_USER_ID,
          `🔥 **Evening Recap — ${today}**\n\nCritical crash: ${errMsg}\n\nCheck worker logs with \`wrangler tail\`.`,
        );
      } catch (dmErr) {
        console.error('[CRON] Crash DM also failed:', dmErr);
      }
    }
  }
}

async function _eveningRecapInner(env: MoltbotEnv, today: string): Promise<void> {
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
        `🌙 **Evening Recap — ${today}**\n\nNo active projects found. Nothing to recap.`,
      );
    }
    return;
  }

  let progressData: Record<string, unknown> = {};

  try {
    const [completedToday, stillOpen, newBlockers, morningCheckin] = await Promise.all([
      env.DB.prepare(
        `SELECT t.title, p.name as project_name
         FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.completed_date LIKE ? AND t.status = 'done'`,
      ).bind(`${today}%`).all(),
      env.DB.prepare(
        `SELECT t.title, t.priority, t.deadline, p.name as project_name
         FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.status IN ('todo', 'in_progress')
         ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
         LIMIT 10`,
      ).all(),
      env.DB.prepare(
        `SELECT b.description, b.severity, p.name as project_name
         FROM blockers b LEFT JOIN projects p ON b.project_id = p.id
         WHERE b.created_at LIKE ? AND b.status = 'open'`,
      ).bind(`${today}%`).all(),
      env.DB.prepare(
        `SELECT tasks_planned FROM daily_checkins
         WHERE checkin_date = ? AND checkin_type = 'morning_brief'
         ORDER BY created_at DESC LIMIT 1`,
      ).bind(today).first(),
    ]);

    // Fetch tomorrow's calendar events as a preview
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    let tomorrowCalendar: Array<Record<string, unknown>> = [];
    try {
      tomorrowCalendar = await fetchCalendarEventsForCron(env, tomorrow);
    } catch (err) {
      console.error('[CRON] Tomorrow calendar fetch failed:', err);
    }

    // Build payload, omitting empty arrays to reduce token count
    progressData = { date: today } as Record<string, unknown>;
    if (completedToday.results.length) progressData.completed_today = completedToday.results;
    if (stillOpen.results.length) progressData.still_open = stillOpen.results;
    if (newBlockers.results.length) progressData.new_blockers = newBlockers.results;
    if (morningCheckin) progressData.morning_plan = morningCheckin;
    if (tomorrowCalendar.length) progressData.tomorrow_calendar = tomorrowCalendar;
  } catch (err) {
    console.error('[CRON] Evening query failed:', err);
    progressData = { date: today, error: 'Failed to query progress' };
  }

  // Auto-comment on tasks completed today (zero LLM cost — direct D1 inserts)
  try {
    const { results: completedTasks } = await env.DB.prepare(
      `SELECT id, title FROM tasks WHERE completed_date LIKE ? AND status = 'done'`,
    ).bind(`${today}%`).all<{ id: string; title: string }>();

    for (const task of completedTasks) {
      // Check if we already commented today to avoid duplicates
      const existing = await env.DB.prepare(
        `SELECT id FROM task_comments WHERE task_id = ? AND author = 'agent' AND comment_type = 'status_change' AND created_at LIKE ?`,
      ).bind(task.id, `${today}%`).first();
      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO task_comments (id, task_id, author, author_name, content, comment_type, metadata, created_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), task.id, 'agent', 'Kudjo',
          `Completed on ${today}.`,
          'status_change', null, new Date().toISOString(), null,
        ).run();
      }
    }

    // Flag at-risk tasks: in-progress with deadline within 2 days and no existing blocking comment
    const twoDaysOut = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
    const { results: atRiskTasks } = await env.DB.prepare(
      `SELECT id, title, deadline FROM tasks
       WHERE status IN ('todo', 'in_progress') AND deadline IS NOT NULL AND deadline <= ? AND deadline >= ?`,
    ).bind(twoDaysOut, today).all<{ id: string; title: string; deadline: string }>();

    for (const task of atRiskTasks) {
      const existingBlocking = await env.DB.prepare(
        `SELECT id FROM task_comments WHERE task_id = ? AND comment_type = 'blocking' AND resolved_at IS NULL`,
      ).bind(task.id).first();
      if (!existingBlocking) {
        const daysLeft = Math.ceil((new Date(task.deadline).getTime() - Date.now()) / 86400000);
        const label = daysLeft <= 0 ? 'overdue' : `due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
        await env.DB.prepare(
          `INSERT INTO task_comments (id, task_id, author, author_name, content, comment_type, metadata, created_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), task.id, 'agent', 'Kudjo',
          `Deadline ${label} (${task.deadline}). Confirm scope/status before closing.`,
          'blocking', null, new Date().toISOString(), null,
        ).run();
      }
    }

    console.log(`[CRON] Auto-commented: ${completedTasks.length} completed, ${atRiskTasks.length} at-risk`);
  } catch (err) {
    console.error('[CRON] Auto-comment failed:', err);
  }

  // Generate recap via direct Anthropic Haiku call (bypasses OpenClaw system prompt)
  const calendarNote = progressData.tomorrow_calendar ? ' Flag tomorrow\'s calendar conflicts.' : '';
  const message = `Evening recap for ${today}. Summarize what got done, what's still open, and what should roll to tomorrow.${calendarNote}\nData:\n${JSON.stringify(progressData)}`;

  const result = await generateCronBrief(message, env);
  console.log('[CRON] Evening recap generated:', result.ok);

  // Forward to Discord DM if configured — always send, even on failure
  let discordSent = false;
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
    try {
      const dmText = result.ok && result.text
        ? `🌙 **Evening Recap — ${today}**\n\n${result.text}`
        : `⚠️ **Evening Recap — ${today}**\n\nRecap generation failed: ${result.text || 'unknown error'}\n\nCheck the dashboard for progress details.`;
      discordSent = await sendDiscordDM(env.DISCORD_BOT_TOKEN, env.DISCORD_OWNER_USER_ID, dmText);
      console.log('[CRON] Evening recap Discord DM:', discordSent ? 'sent' : 'failed');
    } catch (err) {
      console.error('[CRON] Discord DM failed:', err);
    }
  } else {
    console.warn('[CRON] Discord DM skipped: DISCORD_BOT_TOKEN or DISCORD_OWNER_USER_ID not set');
  }

  try {
    await env.DB.prepare(
      `INSERT INTO agent_logs (id, action, details, source, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      'evening_recap_sent',
      JSON.stringify({ date: today, haiku_ok: result.ok, discord_sent: discordSent, error: result.ok ? undefined : result.text }),
      'cron',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[CRON] Agent log failed:', err);
  }
}
