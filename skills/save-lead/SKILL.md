---
name: save-lead
description: Save or update a lead in the database. Upserts by domain so duplicate domains are merged automatically.
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

# Save Lead

Save a business lead to the D1 database. Upserts by domain — duplicates are merged.

## Usage

Provide lead data as JSON. At minimum, `domain` or `website` is required.

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

## Example

```
save-lead lead_json={"domain":"example.com","business_name":"Example Corp","email":"info@example.com","city":"Austin","state":"TX","match_score":85}
```

## Response

`{ "ok": true, "domain": "example.com" }`
