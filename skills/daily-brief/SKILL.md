---
name: daily-brief
description: Fetch the aggregated dashboard data for morning briefs, evening recaps, and weekly reviews. Returns all active projects, overdue tasks, open blockers, upcoming deadlines, and progress stats in a single call.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/dashboard"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Daily Brief

Use this skill to pull the full dashboard snapshot for generating morning briefs, evening recaps, and weekly reviews.

## What It Returns

- **summary**: Counts of active projects, overdue tasks, open blockers, critical blockers, tasks due today, in-progress tasks, stalled projects
- **projects**: All active projects with task counts per status and open blocker count
- **overdue_tasks**: Tasks past their deadline that are not done or deferred
- **today_tasks**: Tasks due today
- **in_progress_tasks**: Currently active tasks
- **open_blockers**: All unresolved blockers with days open and severity
- **upcoming_deadlines**: Tasks due in the next 7 days
- **stalled_projects**: Active projects with no task updates in 5+ days
- **last_checkin**: Most recent check-in record

## When to Use

- **Morning brief**: Pull dashboard, then summarize top priorities, overdue items, blockers, and nearest deadlines
- **Evening recap**: Pull dashboard, then compare with morning plan to identify what got done vs. what rolled
- **Weekly review**: Pull dashboard, then summarize per-project progress, identify slipping/stalled projects, recommend next week focus

## Taking Snapshots

To record a daily progress snapshot for trending:

`POST /api/dashboard/snapshot`

This creates a progress_snapshots entry for each active project with current stats. Run this once per day (typically during the morning brief).
