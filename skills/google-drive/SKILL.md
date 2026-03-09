---
name: google-drive
description: Manage files in Google Drive — list, search, read, create, and download files. Supports Google-native files (Docs, Sheets, Slides) and regular uploads. Use this for all file management operations.
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

Manage files in Google Drive. Use this skill to find, read, create, and organize files.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### List / Search Files

`GET /api/google/drive/files?q=<drive_query>&pageSize=20&pageToken=<token>&account_id=<optional>`

Uses [Google Drive query syntax](https://developers.google.com/drive/api/guides/search-files):

**Example queries:**
- `name contains 'proposal'` — files with "proposal" in the name
- `mimeType = 'application/vnd.google-apps.spreadsheet'` — all spreadsheets
- `modifiedTime > '2026-01-01T00:00:00'` — recently modified files
- `'root' in parents` — files in the root folder
- `trashed = false and name contains 'invoice'` — non-trashed invoices

### Get File Metadata

`GET /api/google/drive/files/:fileId?account_id=<optional>`

Returns: id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, description.

### Download / Export File Content

`GET /api/google/drive/files/:fileId/content?exportMimeType=text/plain&account_id=<optional>`

- For Google-native files (Docs, Sheets, Slides): exports to the specified `exportMimeType`
  - `text/plain` — plain text (default)
  - `text/csv` — CSV (for Sheets)
  - `application/pdf` — PDF
  - `text/html` — HTML
- For regular files (PDF, images, etc.): downloads the raw content

### Create File

`POST /api/google/drive/files`

```json
{
  "name": "My Document",
  "mimeType": "application/vnd.google-apps.document",
  "content": "Optional initial content",
  "parents": ["folder_id"],
  "account_id": "<optional>"
}
```

**Common mimeTypes for creation:**
- `application/vnd.google-apps.document` — Google Doc
- `application/vnd.google-apps.spreadsheet` — Google Sheet
- `application/vnd.google-apps.folder` — Folder
- `text/plain` — Plain text file

## When to Use

- **Finding files**: Search for documents, spreadsheets, or any file by name or type
- **Reading content**: Download or export file content for analysis
- **Creating files**: Create new Google Docs, Sheets, or folders
- **Organizing**: List files in specific folders

## Important Notes

- Use the `google-sheets` skill for reading/writing spreadsheet cell data
- Use the `google-docs` skill for editing document content
- This skill is best for file-level operations (find, create, download)
