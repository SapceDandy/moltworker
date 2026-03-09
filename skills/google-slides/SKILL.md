---
name: google-slides
description: Read Google Slides presentations — get slide content, structure, speaker notes, and layout. Use this to read and analyze existing presentations. For creating or editing presentations, use the google-slides-write skill.
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

# Google Slides (Read)

Read Google Slides presentations to inspect slide content, structure, and speaker notes.

All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### Get Presentation Content

`GET /api/google/slides/:presentationId?account_id=<optional>`

Returns the presentation's title, slides array (with page elements, text, shapes, images), pageSize, and revisionId.

**Response fields:**
- `presentationId`: Unique ID
- `title`: Presentation title
- `slides`: Array of slide objects with `pageElements` (shapes, text boxes, images, tables)
- `pageSize`: Width and height of slides
- `revisionId`: Current revision

## When to Use

- **Reading presentations**: Extract content from existing slide decks for analysis
- **Reviewing slides**: Check slide content, speaker notes, and structure
- **Content extraction**: Pull text, data, or structure from presentations
- **Audit**: Review presentations for completeness or accuracy

## Important Notes

- Use `google-drive` skill to find presentation IDs by name
- Slide content is structured as `pageElements` containing shapes, text boxes, images, and tables
- Each shape's text is in `shape.text.textElements[].textRun.content`
