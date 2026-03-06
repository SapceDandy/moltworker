---
name: google-gmail
description: Search and read Gmail threads (read-only). Use this to find meeting context, action items from emails, or follow up on communications. Supports multiple Google accounts.
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

# Gmail (Read-Only)

Search and read the user's email to extract context for meetings, find action items, and follow up on communications.

## Endpoints

### Search Threads

`GET /api/google/gmail/threads?q=<search_query>&account_id=<optional>&max_results=10`

Uses Gmail search syntax (same as the Gmail search bar). Returns thread IDs and snippets.

**Example queries:**
- `is:unread` — unread emails
- `from:boss@company.com newer_than:2d` — recent emails from someone
- `subject:project update` — emails about project updates
- `has:attachment newer_than:7d` — recent emails with attachments

### Get Thread Detail

`GET /api/google/gmail/threads/:threadId?account_id=<optional>`

Returns thread metadata (Subject, From, To, Date) for each message in the thread.

## When to Use

- **Meeting prep**: Search for emails related to an upcoming meeting topic or attendees
- **Action items**: Find recent threads that may contain tasks or follow-ups
- **Context gathering**: Look up email history with a specific person or project
- **Morning brief**: Check for important unread emails to mention in the daily plan

## Important Notes

- This skill is **read-only** — it cannot send, reply to, or modify emails
- Keep searches targeted to minimize API calls
- Respect privacy: summarize email content, don't quote full bodies verbatim
