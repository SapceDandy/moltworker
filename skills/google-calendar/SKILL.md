---
name: google-calendar
description: Read, create, and update Google Calendar events. Use this to check the user's schedule, block focus time, or reschedule meetings. Supports multiple Google accounts.
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

Interact with the user's Google Calendar to read events, create focus blocks, and suggest schedule changes.

## Endpoints

### List Events

`GET /api/google/calendar/events?date=YYYY-MM-DD&account_id=<optional>`

Returns events for the given date from all connected Google accounts (or a specific one).

**Response fields per event:**
- `summary`: Event title
- `start.dateTime` / `start.date`: Start time
- `end.dateTime` / `end.date`: End time
- `location`: Meeting location or video link
- `attendees`: List of attendees
- `_account_email`: Which Google account this event belongs to
- `_account_label`: Account label (e.g., "personal", "work")

### Create Event

`POST /api/google/calendar/events`

```json
{
  "summary": "Focus: Project X sprint",
  "start": { "dateTime": "2025-03-05T09:00:00-06:00" },
  "end": { "dateTime": "2025-03-05T11:00:00-06:00" },
  "description": "Blocked by Kudjo for deep work",
  "account_id": "<optional, uses first account if omitted>"
}
```

### Update/Reschedule Event

`PUT /api/google/calendar/events/:eventId`

```json
{
  "start": { "dateTime": "2025-03-05T14:00:00-06:00" },
  "end": { "dateTime": "2025-03-05T16:00:00-06:00" },
  "account_id": "<optional>"
}
```

## When to Use

- **Morning brief**: Fetch today's events to factor meetings into the daily plan
- **Focus blocks**: Create calendar events to protect deep work time
- **Conflict detection**: Check if a proposed task deadline conflicts with meetings
- **Rescheduling**: Suggest moving events when schedule is overloaded
- **Evening recap**: Preview tomorrow's calendar to prep the next day
