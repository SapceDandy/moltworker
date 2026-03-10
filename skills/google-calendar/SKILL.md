---
name: google-calendar
description: Read, create, and update Google Calendar events — check schedule, block focus time, reschedule meetings.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/google/calendar/events?date={{date}}"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Google Calendar

## Endpoints

### List: `GET /api/google/calendar/events?date=YYYY-MM-DD&account_id=<optional>`
Returns: summary, start/end dateTime, location, attendees, _account_email.

### Create: `POST /api/google/calendar/events`
```json
{ "summary": "Focus block", "start": { "dateTime": "2025-03-05T09:00:00-06:00" }, "end": { "dateTime": "2025-03-05T11:00:00-06:00" }, "account_id": "<optional>" }
```

### Update: `PUT /api/google/calendar/events/:eventId` — same body format as create.
