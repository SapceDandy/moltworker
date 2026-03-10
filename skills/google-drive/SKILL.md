---
name: google-drive
description: Manage Google Drive files — list, search, read, create, download/export. Use for file-level operations; use google-sheets/google-docs for content editing.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/google/drive/files?q={{query}}"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Google Drive

## Endpoints

### Search: `GET /api/google/drive/files?q=<drive_query>&pageSize=20&account_id=<optional>`
Query syntax: `name contains 'proposal'`, `mimeType = 'application/vnd.google-apps.spreadsheet'`, `modifiedTime > '2026-01-01'`

### Metadata: `GET /api/google/drive/files/:fileId?account_id=<optional>`

### Download: `GET /api/google/drive/files/:fileId/content?exportMimeType=text/plain&account_id=<optional>`
Export types: `text/plain`, `text/csv`, `application/pdf`, `text/html`

### Create: `POST /api/google/drive/files`
```json
{ "name": "My Doc", "mimeType": "application/vnd.google-apps.document", "content": "optional", "parents": ["folder_id"], "account_id": "<optional>" }
```
mimeTypes: `application/vnd.google-apps.document`, `.spreadsheet`, `.folder`, `text/plain`
