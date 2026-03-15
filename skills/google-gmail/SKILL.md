---
name: google-gmail
description: Search/read Gmail threads. Create Gmail drafts (appears in owner's Drafts folder for review). List, update, delete, and send drafts.
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

Search/read threads. Create drafts for owner review. Manage and send drafts.

## Read Endpoints

### Search threads: `GET /api/google/gmail/threads?q=<gmail_query>&account_id=<optional>&max_results=10`
Examples: `is:unread`, `from:user@example.com newer_than:2d`, `subject:project update`

### Thread detail: `GET /api/google/gmail/threads/:threadId?account_id=<optional>`

## Drafts API

**PREFERRED: Always create drafts instead of sending directly.** Drafts appear in the owner's Gmail Drafts folder for review before sending.

### Create draft: `POST /api/google/gmail/drafts`
```json
{ "to": "john@acme.com", "subject": "Following up", "body": "Hi John...", "cc": "", "bcc": "", "thread_id": "", "in_reply_to": "", "references": "" }
```
- Use `html` instead of `body` for HTML emails.
- Set `thread_id` to reply within an existing thread.
- Set `in_reply_to` and `references` for proper email threading headers.
- Returns: `{ ok: true, draft_id, message_id }`

### List drafts: `GET /api/google/gmail/drafts?max_results=20&page_token=<optional>&account_id=<optional>`

### Get draft: `GET /api/google/gmail/drafts/:draftId?account_id=<optional>`

### Update draft: `PUT /api/google/gmail/drafts/:draftId`
Same body fields as create.

### Delete draft: `DELETE /api/google/gmail/drafts/:draftId?account_id=<optional>`

### Send draft: `POST /api/google/gmail/drafts/:draftId/send`
```json
{ "account_id": "<optional>" }
```
Sends an existing draft. Only use when owner explicitly asks to send.

## Legacy: Action Queue

`POST /api/actions` with `action_type: "email_draft"` to queue for approval via the Actions UI.
```json
{ "action_type": "email_draft", "title": "Follow up with Acme", "content": "{\"to\":\"john@acme.com\",\"subject\":\"Following up\",\"body\":\"Hi John...\"}" }
```
