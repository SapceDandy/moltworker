---
name: google-docs
description: Read, create, and edit Google Docs — get content, create documents, and batch-update with insert/delete/replace text operations.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/google/docs/{{documentId}}"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Google Docs

Read, create, and edit Google Docs.

## Endpoints

### Read: `GET /api/google/docs/:documentId?account_id=<optional>`

### Create: `POST /api/google/docs` — `{ "title": "My Doc", "account_id": "<optional>" }`

### Edit: `PATCH /api/google/docs/:documentId`
```json
{ "requests": [{ "insertText": { "location": { "index": 1 }, "text": "Hello" } }], "account_id": "<optional>" }
```
Request types: `insertText`, `deleteContentRange`, `insertTable`, `replaceAllText`. Body starts at index 1.
