---
name: google-docs
description: Read, create, and edit Google Docs — get document content, create new documents, and update text with batch operations. Use this for all document editing operations.
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

Read, create, and edit Google Docs. Use this skill for document-level content operations.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### Get Document Content

`GET /api/google/docs/:documentId?account_id=<optional>`

Returns the document's title, body (structured JSON with paragraphs, text runs, etc.), and revisionId.

### Create New Document

`POST /api/google/docs`

```json
{
  "title": "Project Proposal",
  "account_id": "<optional>"
}
```

Returns `documentId`, `title`, and `revisionId`. Use the batch update endpoint to add content after creation.

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

## When to Use

- **Creating documents**: Generate reports, proposals, meeting notes, or any text document
- **Reading documents**: Extract content from existing docs for analysis
- **Editing documents**: Update existing documents with new content
- **Templates**: Create documents from templates by inserting/replacing text

## Important Notes

- Use `google-drive` skill to find document IDs by name
- Batch update requests are applied in order — plan indexes carefully
- For simple content creation, create the doc then insert text at index 1
- For reading plain text, prefer `google-drive` file content export with `exportMimeType=text/plain`
