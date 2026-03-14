import type { MoltbotEnv } from '../types';
import { generateCronBrief } from '../gateway/rpc';
import { sendDiscordDM } from './discord';

/**
 * Weekly review: summarize all project progress, identify issues, recommend focus.
 */
export async function weeklyReview(env: MoltbotEnv): Promise<void> {
  console.log('[CRON] Running weekly review');
  const today = new Date().toISOString().split('T')[0];

  try {
    await _weeklyReviewInner(env, today);
  } catch (err) {
    console.error('[CRON] Weekly review top-level crash:', err);
    if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await sendDiscordDM(
          env.DISCORD_BOT_TOKEN,
          env.DISCORD_OWNER_USER_ID,
          `🔥 **Weekly Review — ${today}**\n\nCritical crash: ${errMsg}\n\nCheck worker logs with \`wrangler tail\`.`,
        );
      } catch (dmErr) {
        console.error('[CRON] Crash DM also failed:', dmErr);
      }
    }
  }
}

async function _weeklyReviewInner(env: MoltbotEnv, today: string): Promise<void> {
  const projectCount = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM projects WHERE status = 'active'",
  ).first<{ c: number }>();
  if (!projectCount?.c) {
    console.log('[CRON] No active projects, sending info DM');
    if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
      await sendDiscordDM(
        env.DISCORD_BOT_TOKEN,
        env.DISCORD_OWNER_USER_ID,
        `📊 **Weekly Review — ${today}**\n\nNo active projects found. Nothing to review.`,
      );
    }
    return;
  }

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

      // Weekly trend: only first and last snapshot per project (shows delta, not raw rows)
      env.DB.prepare(
        `SELECT project_id, p.name as project_name,
          MIN(snapshot_date) as week_start_date,
          MAX(snapshot_date) as week_end_date,
          (SELECT s1.percent_complete FROM progress_snapshots s1 WHERE s1.project_id = s.project_id AND s1.snapshot_date = MIN(s.snapshot_date)) as start_pct,
          (SELECT s2.percent_complete FROM progress_snapshots s2 WHERE s2.project_id = s.project_id AND s2.snapshot_date = MAX(s.snapshot_date)) as end_pct,
          (SELECT s2.health FROM progress_snapshots s2 WHERE s2.project_id = s.project_id AND s2.snapshot_date = MAX(s.snapshot_date)) as current_health
         FROM progress_snapshots s LEFT JOIN projects p ON s.project_id = p.id
         WHERE s.snapshot_date >= date(?, '-7 days')
         GROUP BY s.project_id`,
      ).bind(today).all(),
    ]);

    // Build payload, omitting empty arrays to reduce token count
    reviewData = { week_ending: today } as Record<string, unknown>;
    if (allProjects.results.length) reviewData.projects = allProjects.results;
    if (weeklyCompleted.results.length) reviewData.completed_this_week = weeklyCompleted.results;
    if (stalledProjects.results.length) reviewData.stalled_projects = stalledProjects.results;
    if (oldBlockers.results.length) reviewData.old_blockers = oldBlockers.results;
    if (weekSnapshots.results.length) reviewData.weekly_trend = weekSnapshots.results;
  } catch (err) {
    console.error('[CRON] Weekly review query failed:', err);
    reviewData = { week_ending: today, error: 'Failed to query weekly data' };
  }

  // Generate review via direct Anthropic Haiku call (bypasses OpenClaw system prompt)
  const message = `Weekly review for week ending ${today}. Summarize per-project progress (% complete, health), identify slipping/stalled projects, flag blockers open 3+ days, recommend focus areas for next week, recommend what to pause/defer/cut.\nData:\n${JSON.stringify(reviewData)}`;

  const result = await generateCronBrief(message, env);
  console.log('[CRON] Weekly review generated:', result.ok);

  // Forward to Discord DM if configured — always send, even on failure
  let discordSent = false;
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_OWNER_USER_ID) {
    try {
      const dmText = result.ok && result.text
        ? `📊 **Weekly Review — week ending ${today}**\n\n${result.text}`
        : `⚠️ **Weekly Review — ${today}**\n\nReview generation failed: ${result.text || 'unknown error'}\n\nCheck the dashboard for details.`;
      discordSent = await sendDiscordDM(env.DISCORD_BOT_TOKEN, env.DISCORD_OWNER_USER_ID, dmText);
      console.log('[CRON] Weekly review Discord DM:', discordSent ? 'sent' : 'failed');
    } catch (err) {
      console.error('[CRON] Discord DM failed:', err);
    }
  } else {
    console.warn('[CRON] Discord DM skipped: DISCORD_BOT_TOKEN or DISCORD_OWNER_USER_ID not set');
  }

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
      JSON.stringify({ week_ending: today, haiku_ok: result.ok, discord_sent: discordSent, error: result.ok ? undefined : result.text }),
      'cron',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[CRON] Agent log failed:', err);
  }
}
