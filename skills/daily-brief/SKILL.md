---
name: daily-brief
description: Fetch aggregated dashboard — active projects, overdue tasks, blockers, deadlines, progress stats in one call.
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

`GET /api/dashboard` — returns: summary (counts), projects (with task stats), overdue_tasks, today_tasks, in_progress_tasks, open_blockers, upcoming_deadlines, stalled_projects, last_checkin.

`POST /api/dashboard/snapshot` — records daily progress snapshot per active project.
