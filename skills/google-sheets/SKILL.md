---
name: google-sheets
description: Read, write, and create Google Sheets — get/update cell values, create spreadsheets.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/google/sheets/{{spreadsheetId}}?range={{range}}"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Google Sheets

## Endpoints

### Read: `GET /api/google/sheets/:spreadsheetId?range=Sheet1!A1:Z100&account_id=<optional>`
With range: returns `values` 2D array. Without range: returns metadata.

### Write: `PUT /api/google/sheets/:spreadsheetId`
```json
{ "range": "Sheet1!A1:C3", "values": [["Name","Email"],["Alice","alice@ex.com"]], "account_id": "<optional>" }
```

### Create: `POST /api/google/sheets` — `{ "title": "Report", "sheets": ["Sheet1","Sheet2"], "account_id": "<optional>" }`
Use `google-drive` to find spreadsheet IDs by name. Formulas in values are evaluated.
