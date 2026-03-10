---
name: google-gmail
description: Search/read Gmail threads and queue email drafts for owner approval. NEVER send emails directly — always create a draft action via POST /api/actions.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/google/gmail/threads?q={{query}}"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Gmail

Search/read threads and draft emails for approval.

## Read Endpoints

### Search: `GET /api/google/gmail/threads?q=<gmail_query>&account_id=<optional>&max_results=10`
Examples: `is:unread`, `from:user@example.com newer_than:2d`, `subject:project update`

### Thread detail: `GET /api/google/gmail/threads/:threadId?account_id=<optional>`

## Send Email (Draft Action)

`POST /api/actions` with `action_type: "email_draft"`. Owner must approve before sending.
```json
{ "action_type": "email_draft", "title": "Follow up with Acme", "content": "{\"to\":\"john@acme.com\",\"subject\":\"Following up\",\"body\":\"Hi John...\"}" }
```
Content JSON fields: `to`, `subject`, `body`, `cc`, `bcc`, `html`. Optional: `task_id`, `lead_id`.
