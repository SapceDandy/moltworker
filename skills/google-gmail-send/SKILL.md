---
name: google-gmail-send
description: Create a draft action to send an email. The email will be queued for owner approval before sending. NEVER send emails directly — always use the draft_actions workflow.
type: http
request:
  method: POST
  url: "${WORKER_URL}/api/actions"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
  body: "{{action_json}}"
response:
  type: json
---

# Gmail Send (via Draft Actions)

Queue an email draft for the owner to review and approve before sending.

**IMPORTANT**: You must NEVER send emails directly. Always create a `draft_action` with `action_type: "email_draft"`. The owner will review and approve/reject it from the Actions page.

## Usage

Create a draft action with `action_type: "email_draft"`. The `content` field must be a JSON string with the email details.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `action_type` | string | Must be `"email_draft"` |
| `title` | string | Short description shown in the actions list |
| `content` | string (JSON) | Email details: `{ "to", "subject", "body" }` |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Link to a task |
| `lead_id` | string | Link to a lead |
| `created_by` | string | Defaults to `"agent"` |

## Content JSON Schema

```json
{
  "to": "recipient@example.com",
  "subject": "Email subject line",
  "body": "Plain text email body",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com",
  "html": "<p>HTML body (use instead of body for HTML emails)</p>"
}
```

## Example

```
google-gmail-send action_json={"action_type":"email_draft","title":"Follow up with Acme Corp","task_id":"task-123","lead_id":"lead-456","content":"{\"to\":\"john@acme.com\",\"subject\":\"Following up on our conversation\",\"body\":\"Hi John,\\n\\nI wanted to follow up on our conversation about...\\n\\nBest,\\nDevon\"}"}
```

## Response

`{ "ok": true, "id": "action-uuid" }`

## Approval Flow

1. Agent creates draft action → status: `pending`
2. Owner reviews in Actions page → sees email preview
3. Owner clicks "Approve & Send" → email sent via Gmail API → status: `sent`
4. Or owner clicks "Reject" → status: `rejected`

## Other Action Types

You can also create these action types (same endpoint, different `action_type`):

- `calendar_event` — Draft a calendar event for approval
- `task_update` — Propose a task change for approval
- `message` — Draft a message for approval
