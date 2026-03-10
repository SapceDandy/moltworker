import { getSandbox, type SandboxOptions } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import { ensureMoltbotGateway } from '../gateway';
import { sendSessionMessage } from '../gateway/rpc';
import { fetchCalendarEventsForCron } from './google-helpers';
import { sendDiscordDM, extractAssistantReply } from './discord';

/**
 * Evening recap: summarize the day's progress and prompt for updates.
 */
export async function eveningRecap(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running evening recap');

  // Skip if no active projects — avoids booting sandbox + Claude API call
  const projectCount = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM projects WHERE status = 'active'",
  ).first<{ c: number }>();
  if (!projectCount?.c) {
    console.log('[CRON] No active projects, skipping evening recap');
    return;
  }

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

  // Compact JSON to reduce token cost; SOUL.md has full evening recap rules
  const calendarNote = progressData.tomorrow_calendar ? ' Flag tomorrow\'s calendar conflicts.' : '';
  const message = `[SYSTEM] Evening recap for ${today}.\n${JSON.stringify(progressData)}\nFollow SOUL.md evening recap rules.${calendarNote}`;

  const result = await sendSessionMessage(sandbox, message, env.MOLTBOT_GATEWAY_TOKEN);
  console.log('[CRON] Evening recap sent:', result.ok, result.status);

  // Forward to Discord DM if configured
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
    try {
      const reply = extractAssistantReply(result.body);
      if (reply) {
        const sent = await sendDiscordDM(env.DISCORD_BOT_TOKEN, env.DISCORD_OWNER_USER_ID, reply);
        console.log('[CRON] Evening recap Discord DM:', sent ? 'sent' : 'failed');
      } else {
        console.warn('[CRON] No assistant reply to forward to Discord');
      }
    } catch (err) {
      console.error('[CRON] Discord DM failed:', err);
    }
  }

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
