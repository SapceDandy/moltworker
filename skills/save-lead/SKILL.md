---
name: save-lead
description: Manage leads in the CRM database. Save, search, list, and update business leads. Upserts by domain so duplicate domains are merged automatically.
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

Manage business leads in the CRM database. All requests require `Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}` header.

## Endpoints

### Save / Upsert a Lead

`POST /api/leads` — Upserts by domain. Duplicates are merged.

At minimum, `domain` or `website` is required.

### List Leads

`GET /api/leads?q=austin&status=new&category=restaurant&state=TX&min_score=50&limit=50&offset=0`

Returns `{ leads: [...], total, limit, offset }`. Supports search across business_name, domain, email, city.

### Get Lead

`GET /api/leads/{id}`

### Update Lead

`PUT /api/leads/{id}` — Update specific fields (e.g., `lead_status`, `notes`, `email`).

### Delete Lead

`DELETE /api/leads/{id}`

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | Business domain (e.g., `example.com`) |
| `business_name` | string | Company name |
| `website` | string | Full website URL |
| `phone` | string | Phone number |
| `email` | string | Contact email |
| `city` | string | City |
| `state` | string | State |
| `category` | string | Business category |
| `owner_or_people` | string | Owner or key people |
| `linkedin_company` | string | LinkedIn company URL |
| `linkedin_people` | string/array | LinkedIn profile URLs |
| `contact_page_url` | string | URL of the contact page |
| `source_urls` | string/array | URLs where lead was found |
| `evidence_snippet` | string | Text snippet supporting the match |
| `match_score` | number | Relevance score (0-100) |
| `notes` | string | Additional notes |
| `lead_status` | string | Pipeline status: `new`, `contacted`, `replied`, `qualified`, `won`, `lost` |

## Lead Discovery

When the owner asks you to find leads:
1. Use `search-tavily` to find businesses matching criteria (industry, location, etc.)
2. Use `fetch-page` or `cloudflare-browser` to extract contact info from business websites
3. Save each lead via `POST /api/leads` with match_score reflecting relevance

## Example

```
save-lead lead_json={"domain":"example.com","business_name":"Example Corp","email":"info@example.com","city":"Austin","state":"TX","match_score":85,"lead_status":"new"}
```

## Response

`{ "ok": true, "domain": "example.com" }`
