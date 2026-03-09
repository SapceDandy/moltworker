---
name: google-slides-write
description: Create and edit Google Slides presentations — create new presentations and update slides with batch operations (add slides, insert text, add shapes, add images, delete slides). Use this for all presentation creation and editing.
type: http
request:
  method: POST
  url: "${WORKER_URL}/api/google/slides"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
  body:
    title: "{{title}}"
response:
  type: json
---

# Google Slides Write

Create and edit Google Slides presentations. Use this skill for all presentation creation and editing operations.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### Create New Presentation

`POST /api/google/slides`

```json
{
  "title": "Q1 Strategy Review",
  "account_id": "<optional>"
}
```

Returns `presentationId`, `title`, and `revisionId`. Use the batch update endpoint below to add slides and content.

### Edit Presentation (Batch Update)

`PATCH /api/google/slides/:presentationId`

```json
{
  "requests": [
    {
      "createSlide": {
        "objectId": "slide_001",
        "insertionIndex": 1,
        "slideLayoutReference": { "predefinedLayout": "TITLE_AND_BODY" }
      }
    },
    {
      "insertText": {
        "objectId": "slide_001_title",
        "text": "Slide Title Here"
      }
    }
  ],
  "account_id": "<optional>"
}
```

**Common request types:**

- **Create slide**: `{ "createSlide": { "objectId": "unique_id", "insertionIndex": 1, "slideLayoutReference": { "predefinedLayout": "TITLE_AND_BODY" } } }`
- **Insert text**: `{ "insertText": { "objectId": "shape_id", "text": "Hello World" } }`
- **Delete slide**: `{ "deleteObject": { "objectId": "slide_id" } }`
- **Create shape**: `{ "createShape": { "objectId": "shape_id", "shapeType": "TEXT_BOX", "elementProperties": { "pageObjectId": "slide_id", "size": { "width": { "magnitude": 300, "unit": "PT" }, "height": { "magnitude": 50, "unit": "PT" } }, "transform": { "scaleX": 1, "scaleY": 1, "translateX": 100, "translateY": 100, "unit": "PT" } } } }`
- **Create image**: `{ "createImage": { "objectId": "img_id", "url": "https://example.com/image.png", "elementProperties": { "pageObjectId": "slide_id" } } }`
- **Replace all text**: `{ "replaceAllText": { "containsText": { "text": "{{placeholder}}", "matchCase": true }, "replaceText": "Actual Value" } }`

**Predefined layouts:**
- `BLANK` — Empty slide
- `TITLE` — Title slide (large centered title)
- `TITLE_AND_BODY` — Title with body text area
- `TITLE_AND_TWO_COLUMNS` — Title with two body columns
- `TITLE_ONLY` — Title bar only
- `SECTION_HEADER` — Section divider
- `ONE_COLUMN_TEXT` — Single column text
- `BIG_NUMBER` — Large number display

## Workflow: Create a Presentation with Content

1. **Create** the presentation: `POST /api/google/slides` with `{ "title": "My Deck" }`
2. **Add slides**: `PATCH /api/google/slides/:id` with `createSlide` requests
3. **Add content**: Use `insertText` to add text to slide placeholders
4. The presentation is immediately available in Google Drive

## When to Use

- **Creating presentations**: Build slide decks for meetings, pitches, or reports
- **Editing presentations**: Update existing slide content
- **Report generation**: Automatically create presentations from data
- **Templates**: Create presentations from templates using replaceAllText
