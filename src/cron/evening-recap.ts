import { getSandbox, type SandboxOptions } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { ensureMoltbotGateway } from '../gateway';
import { sendSessionMessage } from '../gateway/rpc';
import { fetchCalendarEventsForCron } from './google-helpers';

/**
 * Evening recap: summarize the day's progress and prompt for updates.
 */
export async function eveningRecap(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running evening recap');

  const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';
  const options: SandboxOptions =
    sleepAfter === 'never' ? { keepAlive: true } : { sleepAfter };
  const sandbox = getSandbox(env.Sandbox, 'moltbot', options);
  await ensureMoltbotGateway(sandbox, env);

  const today = new Date().toISOString().split('T')[0];
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

    progressData = {
      date: today,
      completed_today: completedToday.results,
      still_open: stillOpen.results,
      new_blockers: newBlockers.results,
      morning_plan: morningCheckin,
      tomorrow_calendar: tomorrowCalendar.length > 0 ? tomorrowCalendar : undefined,
    };
  } catch (err) {
    console.error('[CRON] Evening query failed:', err);
    progressData = { date: today, error: 'Failed to query progress' };
  }

  const calendarNote = (progressData as Record<string, unknown>).tomorrow_calendar ? ' Preview tomorrow\'s calendar and flag any early meetings or scheduling conflicts with open tasks.' : '';
  const message = `[SYSTEM] Evening recap trigger for ${today}. Here is today's progress:\n\n${JSON.stringify(progressData, null, 2)}\n\nAsk Devon for an end-of-day update. Summarize what got done, what's still open, and what should roll to tomorrow.${calendarNote} Log the evening check-in. Keep it conversational and brief.`;

  const result = await sendSessionMessage(sandbox, message, env.MOLTBOT_GATEWAY_TOKEN);
  console.log('[CRON] Evening recap sent:', result.ok, result.status);

  try {
    await env.DB.prepare(
      `INSERT INTO agent_logs (id, action, details, source, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      'evening_recap_sent',
      JSON.stringify({ date: today, gateway_response: result.status }),
      'cron',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[CRON] Agent log failed:', err);
  }
}
