import { Hono } from 'hono';
import type { AppEnv } from '../types';

const dashboard = new Hono<AppEnv>();

// GET /dashboard - Aggregated status for morning briefs and agent consumption
dashboard.get('/', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      activeProjects,
      overdueTasks,
      todayTasks,
      inProgressTasks,
      openBlockers,
      blockedTasks,
      upcomingDeadlines,
      recentCheckin,
      stalledProjects,
    ] = await Promise.all([
      // Active projects with summary stats
      c.env.DB.prepare(
        `SELECT p.*,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'todo') as todo_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'in_progress') as in_progress_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as done_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'blocked') as blocked_count,
          (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.status = 'open') as open_blocker_count
        FROM projects p
        WHERE p.status = 'active'
        ORDER BY CASE p.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),

      // Overdue tasks
      c.env.DB.prepare(
        `SELECT t.*, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.deadline < ? AND t.status NOT IN ('done', 'deferred')
         ORDER BY t.deadline ASC`,
      ).bind(today).all(),

      // Tasks due today
      c.env.DB.prepare(
        `SELECT t.*, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.deadline = ? AND t.status NOT IN ('done', 'deferred')
         ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).bind(today).all(),

      // In-progress tasks
      c.env.DB.prepare(
        `SELECT t.*, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.status = 'in_progress'
         ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),

      // Open blockers
      c.env.DB.prepare(
        `SELECT b.*, p.name as project_name, t.title as task_title,
          CAST(julianday('now') - julianday(b.created_at) AS INTEGER) as days_open
         FROM blockers b
         LEFT JOIN projects p ON b.project_id = p.id
         LEFT JOIN tasks t ON b.task_id = t.id
         WHERE b.status = 'open'
         ORDER BY CASE b.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),

      // Blocked tasks (tasks with status = 'blocked')
      c.env.DB.prepare(
        `SELECT t.*, p.name as project_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.status = 'blocked'
         ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
      ).all(),

      // Upcoming deadlines (next 7 days)
      c.env.DB.prepare(
        `SELECT t.*, p.name as project_name,
          CAST(julianday(t.deadline) - julianday('now') AS INTEGER) as days_until
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.deadline BETWEEN ? AND date(?, '+7 days')
           AND t.status NOT IN ('done', 'deferred')
         ORDER BY t.deadline ASC`,
      ).bind(today, today).all(),

      // Most recent check-in
      c.env.DB.prepare(
        `SELECT * FROM daily_checkins ORDER BY created_at DESC LIMIT 1`,
      ).first(),

      // Stalled projects (no task updates in 5+ days)
      c.env.DB.prepare(
        `SELECT p.*, MAX(t.updated_at) as last_task_update,
          CAST(julianday('now') - julianday(MAX(t.updated_at)) AS INTEGER) as days_since_update
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.status = 'active'
         GROUP BY p.id
         HAVING days_since_update >= 5 OR last_task_update IS NULL
         ORDER BY days_since_update DESC`,
      ).all(),
    ]);

    // Compute summary stats
    const totalActive = activeProjects.results?.length ?? 0;
    const totalOverdue = overdueTasks.results?.length ?? 0;
    const totalBlockerRecords = openBlockers.results?.length ?? 0;
    const totalBlockedTasks = blockedTasks.results?.length ?? 0;
    const totalBlocked = totalBlockerRecords + totalBlockedTasks;
    const criticalBlockers = (openBlockers.results ?? []).filter(
      (b: Record<string, unknown>) => b.severity === 'critical' || (b.days_open as number) >= 7,
    ).length;

    return c.json({
      date: today,
      summary: {
        active_projects: totalActive,
        overdue_tasks: totalOverdue,
        open_blockers: totalBlocked,
        critical_blockers: criticalBlockers,
        tasks_due_today: todayTasks.results?.length ?? 0,
        tasks_in_progress: inProgressTasks.results?.length ?? 0,
        stalled_projects: stalledProjects.results?.length ?? 0,
        blocked_tasks: totalBlockedTasks,
      },
      projects: activeProjects.results,
      overdue_tasks: overdueTasks.results,
      today_tasks: todayTasks.results,
      in_progress_tasks: inProgressTasks.results,
      open_blockers: openBlockers.results,
      blocked_tasks: blockedTasks.results,
      upcoming_deadlines: upcomingDeadlines.results,
      stalled_projects: stalledProjects.results,
      last_checkin: recentCheckin,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[dashboard] Failed:', msg);
    return c.json({ error: { code: 'DASHBOARD_FAILED', message: msg } }, 500);
  }
});

// POST /dashboard/snapshot - Take a daily progress snapshot for all active projects
dashboard.post('/snapshot', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const { results: activeProjects } = await c.env.DB.prepare(
      `SELECT p.id, p.percent_complete, p.health,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done', 'deferred')) as open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as completed_tasks,
        (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.status = 'open') as open_blockers
       FROM projects p WHERE p.status = 'active'`,
    ).all();

    const batch: D1PreparedStatement[] = [];
    for (const p of activeProjects as Array<Record<string, unknown>>) {
      batch.push(
        c.env.DB.prepare(
          `INSERT INTO progress_snapshots (id, snapshot_date, project_id, percent_complete, open_tasks, completed_tasks, open_blockers, health, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          today,
          p.id,
          p.percent_complete,
          p.open_tasks,
          p.completed_tasks,
          p.open_blockers,
          p.health,
          now,
        ),
      );
    }

    if (batch.length > 0) {
      await c.env.DB.batch(batch);
    }

    return c.json({ ok: true, snapshots: batch.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[dashboard] Snapshot failed:', msg);
    return c.json({ error: { code: 'SNAPSHOT_FAILED', message: msg } }, 500);
  }
});

export { dashboard };
