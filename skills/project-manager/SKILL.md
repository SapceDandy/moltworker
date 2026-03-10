---
name: project-manager
description: CRUD for projects, tasks, goals, milestones, blockers, checkins, reminders, comments, and draft actions. ALWAYS use this for status tracking.
type: http
request:
  url: "${WORKER_URL}/api/projects"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Project Manager

All endpoints: `${WORKER_URL}` base. All require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}`.
CRUD pattern: `GET /api/{resource}?filters`, `GET /api/{resource}/{id}`, `POST /api/{resource}`, `PUT /api/{resource}/{id}`, `DELETE /api/{resource}/{id}`

## Projects
`/api/projects` — fields: name, description, status(active/paused/completed/archived), priority(critical/high/medium/low), health(on_track/at_risk/behind/blocked), percent_complete, start_date, target_date, notes

## Tasks
`/api/tasks?project_id=&status=&overdue=true` — fields: title, description, project_id, milestone_id, status(todo/in_progress/done/blocked/deferred), priority, deadline, blocked_reason, deferred_until. Setting status=done auto-sets completed_date.

## Goals
`/api/goals?project_id=&status=active` — fields: title, description, project_id, metric, target_value, current_value, status(active/achieved/dropped), target_date

## Milestones
`/api/milestones?project_id=` — fields: title, description, project_id(required), status(pending/in_progress/completed), percent_complete, target_date

## Blockers
`/api/blockers?status=open&project_id=` — fields: description, project_id, task_id, status(open/resolved), severity(critical/high/medium/low), resolution

## Check-ins
`/api/checkins?date=&type=` — POST: `{ "checkin_type": "morning_brief", "summary": "...", "tasks_planned": ["id1"] }`

## Reminders
`/api/reminders?status=pending&upcoming=true` — fields: title, description, remind_at(ISO), status(pending/done/snoozed), related_project_id, related_task_id, recurrence(daily/weekly/monthly)

## Comments
`GET/POST /api/comments/{task_id}`, `DELETE /api/comments/{task_id}/{id}` — fields: content, author(user/agent), author_name, comment_type(comment/status_change/progress_report/action_request)

## Actions
`/api/actions?status=pending&action_type=email_draft` — Create: `{ "action_type": "email_draft", "title": "...", "content": "{...}" }`. Approve: `PUT /api/actions/{id}/approve`. NEVER send emails directly.
