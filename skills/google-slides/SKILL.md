---
name: google-slides
description: Read, create, and edit Google Slides presentations — get content, create decks, and batch-update with createSlide, insertText, createShape, createImage, deleteObject, replaceAllText.
type: http
request:
  method: GET
  url: "${WORKER_URL}/api/google/slides/{{presentationId}}"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: json
---

# Google Slides

Read, create, and edit presentations.

## Endpoints

### Read: `GET /api/google/slides/:presentationId?account_id=<optional>`

### Create: `POST /api/google/slides` — `{ "title": "My Deck", "account_id": "<optional>" }`

### Edit: `PATCH /api/google/slides/:presentationId`
```json
{ "requests": [{ "createSlide": { "objectId": "slide_001", "insertionIndex": 1, "slideLayoutReference": { "predefinedLayout": "TITLE_AND_BODY" } } }], "account_id": "<optional>" }
```
Request types: `createSlide`, `insertText`, `deleteObject`, `createShape`, `createImage`, `replaceAllText`.
Layouts: `BLANK`, `TITLE`, `TITLE_AND_BODY`, `TITLE_AND_TWO_COLUMNS`, `SECTION_HEADER`.
