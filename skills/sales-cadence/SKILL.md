---
name: sales-cadence
description: Manage sales cadences, pipelines, touches, and AI call prep briefs. Use this for all sales outreach tracking and pipeline management.
type: http
request:
  url: "${WORKER_URL}/api/cadence/pipelines"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Sales Cadence Manager

All endpoints: `${WORKER_URL}` base. All require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}`.

## Pipelines
`GET /api/cadence/pipelines` — List all sales pipelines
`GET /api/cadence/pipelines/{id}` — Get pipeline with all stages
`POST /api/cadence/pipelines` — fields: name, description, is_default(bool)
`PUT /api/cadence/pipelines/{id}` — Update pipeline
`DELETE /api/cadence/pipelines/{id}` — Delete pipeline

## Pipeline Stages
`GET /api/cadence/pipelines/{id}/stages` — List stages for a pipeline (ordered by stage_number)
`POST /api/cadence/pipelines/{id}/stages` — fields: name(required), stage_number(required), stage_type(research/email/call/linkedin/meeting/milestone), default_owner(ai/ai_draft/human), delay_days, framework(spin/meddic/challenger), guidance, benchmarks(JSON)
`PUT /api/cadence/stages/{id}` — Update a stage
`DELETE /api/cadence/stages/{id}` — Delete a stage

## Cadences (one per lead being worked)
`GET /api/cadence/cadences?lead_id=&status=&pipeline_id=&health=&next_touch_before=` — List cadences with filters
`GET /api/cadence/cadences/{id}` — Get cadence detail with touches and stages
`POST /api/cadence/cadences` — fields: lead_id(required), pipeline_id(optional, uses default), priority(high/medium/low), owner_notes. Auto-schedules touches for all stages.
`PUT /api/cadence/cadences/{id}` — fields: status(active/paused/won/lost/completed), priority, health(on_track/at_risk/stalled), next_touch_due, loss_reason, owner_notes, lead_score, current_stage_id
`DELETE /api/cadence/cadences/{id}` — Delete cadence and all touches
`POST /api/cadence/cadences/{id}/advance` — Advance to next pipeline stage. Returns new stage info or marks completed.

## Touches (interaction log)
`GET /api/cadence/cadences/{cadenceId}/touches` — List all touches for a cadence
`POST /api/cadence/cadences/{cadenceId}/touches` — Log a manual touch: fields: touch_type(email/call/linkedin/meeting/note), owner(human/ai), outcome(fantastic/good/okay/not_so_good/bad), outcome_notes, stage_id, scheduled_at, completed_at
`PUT /api/cadence/touches/{id}` — Update a touch: fields: status(scheduled/completed/skipped), outcome, outcome_notes, gmail_message_id, gmail_thread_id, action_id, call_prep(JSON), email_metrics(JSON)

## AI Call Prep
`POST /api/cadence/cadences/{id}/call-prep` — Generate AI call prep brief. Optional body: `{ "touch_id": "..." }` to save the brief to a specific touch.
Returns structured JSON with: summary, intel(company/contacts/signals/history), mindset, navigation, outcomes(fantastic/good/okay/not_so_good/bad), opening_line, questions[], objection_handlers[].

## Dashboard
`GET /api/cadence/dashboard` — Today's due touches, funnel stage counts, stalled cadences, summary (active/won/lost/paused), recent outcomes.

## Workflow: Processing Daily Queue
1. `GET /api/cadence/dashboard` to see today's due touches
2. For each due touch:
   a. `POST /api/cadence/cadences/{id}/call-prep` to generate a brief
   b. After the touch: `PUT /api/cadence/touches/{id}` with outcome and notes
   c. If positive outcome: `POST /api/cadence/cadences/{id}/advance` to move forward
3. For stalled cadences: update health to 'at_risk' or adjust next_touch_due

## Workflow: Enrolling a Lead
Leads are auto-enrolled when created via `POST /api/leads`. To manually enroll:
1. `POST /api/cadence/cadences` with `{ "lead_id": "..." }`
This creates the cadence and auto-schedules touches for all pipeline stages.

## Outcome Scale
When logging touch outcomes, use this 5-tier scale:
- **fantastic** — Meeting booked, strong interest expressed, champion identified
- **good** — Positive reply, engaged conversation, agreed to follow-up
- **okay** — Neutral response, no objection but no commitment
- **not_so_good** — Soft rejection, timing not right, referred elsewhere
- **bad** — Hard rejection, unsubscribe request, wrong contact, bounced
