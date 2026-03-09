---
name: google-docs-write
description: Create and edit Google Docs — create new documents and update content with batch operations (insert text, delete text, replace text, insert tables). Use this for all document writing and editing.
type: http
request:
  method: POST
  url: "${WORKER_URL}/api/google/docs"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
  body:
    title: "{{title}}"
response:
  type: json
---

# Google Docs Write

Create and edit Google Docs. Use this skill for all document creation and editing operations.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### Create New Document

`POST /api/google/docs`

```json
{
  "title": "Project Proposal",
  "account_id": "<optional>"
}
```

Returns `documentId`, `title`, and `revisionId`. Use the batch update endpoint below to add content after creation.

### Edit Document (Batch Update)

`PATCH /api/google/docs/:documentId`

```json
{
  "requests": [
    {
      "insertText": {
        "location": { "index": 1 },
        "text": "Hello, World!\n\nThis is the document body."
      }
    }
  ],
  "account_id": "<optional>"
}
```

**Common request types:**

- **Insert text**: `{ "insertText": { "location": { "index": 1 }, "text": "..." } }`
- **Delete text**: `{ "deleteContentRange": { "range": { "startIndex": 1, "endIndex": 10 } } }`
- **Insert table**: `{ "insertTable": { "rows": 3, "columns": 3, "location": { "index": 1 } } }`
- **Replace text**: `{ "replaceAllText": { "containsText": { "text": "old", "matchCase": true }, "replaceText": "new" } }`

**Index notes:**
- Document body starts at index 1
- Newlines count as 1 character
- Use `replaceAllText` for simple find-and-replace (no index needed)

## Workflow: Create a Document with Content

1. **Create** the document: `POST /api/google/docs` with `{ "title": "My Doc" }`
2. **Write content**: `PATCH /api/google/docs/:documentId` with insertText requests
3. The document is immediately available in Google Drive

## When to Use

- **Creating documents**: Generate reports, proposals, meeting notes, or any text document
- **Editing documents**: Update existing documents with new content
- **Templates**: Create documents from templates by inserting/replacing text
- **Reports**: Write analysis results or summaries into Google Docs
