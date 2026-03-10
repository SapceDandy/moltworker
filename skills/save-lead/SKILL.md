---
name: save-lead
description: CRM lead management — save, search, list, update leads. Upserts by domain.
type: http
request:
  method: POST
  url: "${WORKER_URL}/api/leads"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
  body: "{{lead_json}}"
response:
  type: json
---

# Lead Manager

CRUD pattern: GET/POST/PUT/DELETE `/api/leads`. Upserts by domain.

## Endpoints
- **Search**: `GET /api/leads?q=&status=&category=&state=&min_score=&limit=50`
- **Save**: `POST /api/leads` — requires `domain` or `website`
- **Update**: `PUT /api/leads/{id}`
- **Delete**: `DELETE /api/leads/{id}`

## Fields
domain, business_name, website, phone, email, city, state, category, owner_or_people, linkedin_company, linkedin_people, contact_page_url, source_urls, evidence_snippet, match_score(0-100), notes, lead_status(new/contacted/replied/qualified/won/lost)

## Discovery Flow
search-tavily → fetch-page/cloudflare-browser → save-lead with match_score.
