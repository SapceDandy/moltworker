---
name: project-manager
description: Manage projects, tasks, goals, milestones, and blockers via the Worker API. Use this skill for ALL project tracking operations — creating, updating, listing, and querying structured project state.
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

Use this skill for all project and task management. This is your primary tool for structured state — ALWAYS use it instead of relying on memory for status tracking.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

All endpoints use `${WORKER_URL}` as the base URL (set in environment).

### Projects

- **List projects**: `GET /api/projects?status=active&priority=high`
- **Get project**: `GET /api/projects/{id}`
- **Create project**: `POST /api/projects` with JSON body `{ "name": "...", "description": "...", "priority": "high", "target_date": "2026-06-01" }`
- **Update project**: `PUT /api/projects/{id}` with JSON body containing fields to update
- **Delete project**: `DELETE /api/projects/{id}`

Project fields: `name`, `description`, `status` (active/paused/completed/archived), `priority` (critical/high/medium/low), `health` (on_track/at_risk/behind/blocked), `percent_complete` (0-100), `start_date`, `target_date`, `notes`

### Tasks

- **List tasks**: `GET /api/tasks?project_id={id}&status=todo&overdue=true`
- **Get task**: `GET /api/tasks/{id}`
- **Create task**: `POST /api/tasks` with JSON body `{ "title": "...", "project_id": "...", "priority": "high", "deadline": "2026-04-01" }`
- **Update task**: `PUT /api/tasks/{id}` with JSON body containing fields to update
- **Delete task**: `DELETE /api/tasks/{id}`

Task fields: `title`, `description`, `project_id`, `milestone_id`, `status` (todo/in_progress/done/blocked/deferred), `priority` (critical/high/medium/low), `deadline`, `blocked_reason`, `deferred_until`, `sort_order`

When marking a task as done, set `status` to `done` — the `completed_date` is auto-set.

### Goals

- **List goals**: `GET /api/goals?project_id={id}&status=active`
- **Get goal**: `GET /api/goals/{id}`
- **Create goal**: `POST /api/goals` with JSON body `{ "title": "...", "project_id": "...", "metric": "revenue", "target_value": "10000" }`
- **Update goal**: `PUT /api/goals/{id}`
- **Delete goal**: `DELETE /api/goals/{id}`

Goal fields: `title`, `description`, `project_id`, `metric`, `target_value`, `current_value`, `status` (active/achieved/dropped), `target_date`

### Milestones

- **List milestones**: `GET /api/milestones?project_id={id}`
- **Get milestone**: `GET /api/milestones/{id}`
- **Create milestone**: `POST /api/milestones` with JSON body `{ "title": "...", "project_id": "...", "target_date": "2026-05-01" }`
- **Update milestone**: `PUT /api/milestones/{id}`
- **Delete milestone**: `DELETE /api/milestones/{id}`

Milestone fields: `title`, `description`, `project_id` (required), `status` (pending/in_progress/completed), `percent_complete`, `target_date`, `sort_order`

### Blockers

- **List blockers**: `GET /api/blockers?status=open&project_id={id}`
- **Create blocker**: `POST /api/blockers` with JSON body `{ "description": "...", "project_id": "...", "task_id": "...", "severity": "high" }`
- **Update blocker**: `PUT /api/blockers/{id}` — set `status` to `resolved` with a `resolution` to close it

Blocker fields: `description`, `project_id`, `task_id`, `status` (open/resolved), `severity` (critical/high/medium/low), `resolution`

### Check-ins

- **List check-ins**: `GET /api/checkins?date=2026-03-03&type=morning_brief`
- **Log check-in**: `POST /api/checkins` with JSON body `{ "checkin_type": "morning_brief", "summary": "...", "tasks_planned": ["id1","id2"] }`

Check-in types: `morning_brief`, `evening_recap`, `midday_check`, `weekly_review`

### Reminders

- **List reminders**: `GET /api/reminders?status=pending&project_id={id}&upcoming=true`
- **Get reminder**: `GET /api/reminders/{id}`
- **Create reminder**: `POST /api/reminders` with JSON body `{ "title": "...", "remind_at": "2026-03-04T09:00:00Z", "related_project_id": "...", "recurrence": "weekly" }`
- **Update reminder**: `PUT /api/reminders/{id}`
- **Delete reminder**: `DELETE /api/reminders/{id}`

Reminder fields: `title`, `description`, `remind_at` (required, ISO datetime), `status` (pending/done/snoozed), `related_project_id`, `related_task_id`, `recurrence` (daily/weekly/monthly or null)

Use `upcoming=true` to get pending reminders due within the next 24 hours.

## Usage Rules

1. ALWAYS query the database before reporting project status. Never say "I remember..." for status — check the API.
2. When the owner mentions a new project or task, offer to add it.
3. When the owner says something is done, update the task status to `done`.
4. When the owner mentions being stuck, create a blocker.
5. Confirm before deleting or archiving anything.
