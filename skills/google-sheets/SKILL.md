---
name: google-sheets
description: Read and write Google Sheets data — get cell values, update ranges, and create new spreadsheets. Use this for all spreadsheet data operations.
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

Read and write spreadsheet data. Use this skill for all cell-level spreadsheet operations.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### Read Spreadsheet Data

`GET /api/google/sheets/:spreadsheetId?range=Sheet1!A1:Z100&account_id=<optional>`

- With `range`: returns cell values as a 2D array (`values: [["A1","B1"],["A2","B2"]]`)
- Without `range`: returns spreadsheet metadata (title, sheet names)

**Range syntax examples:**
- `Sheet1!A1:D10` — specific range on Sheet1
- `Sheet1!A:A` — entire column A
- `Sheet1!1:1` — entire row 1
- `Sheet1` — all data on Sheet1

### Write Values

`PUT /api/google/sheets/:spreadsheetId`

```json
{
  "range": "Sheet1!A1:C3",
  "values": [
    ["Name", "Email", "Score"],
    ["Alice", "alice@example.com", 95],
    ["Bob", "bob@example.com", 87]
  ],
  "account_id": "<optional>"
}
```

Values are processed with `USER_ENTERED` input option (formulas and formatting are interpreted).

### Create New Spreadsheet

`POST /api/google/sheets`

```json
{
  "title": "Q1 Sales Report",
  "sheets": ["Revenue", "Expenses", "Summary"],
  "account_id": "<optional>"
}
```

Returns `spreadsheetId` and `spreadsheetUrl`.

## When to Use

- **Reading data**: Pull data from existing spreadsheets for analysis or reporting
- **Writing data**: Update cells with new values, formulas, or results
- **Creating spreadsheets**: Create new sheets for tracking, reporting, or data collection
- **Lead tracking**: Read/write CRM data stored in Google Sheets
- **Reporting**: Generate periodic reports as spreadsheets

## Important Notes

- Use `google-drive` skill to find spreadsheet IDs by name
- Values are returned as a 2D array — first row is typically headers
- Formulas in written values are evaluated (e.g., `=SUM(A1:A10)`)
