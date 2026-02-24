---
name: save-lead
description: Save or update a lead in the database. Upserts by domain so duplicate domains are merged automatically.
---

# Save Lead

Save a business lead to the D1 database. If a lead with the same domain already exists, it will be updated with the new data.

## Usage

Provide lead data as JSON. At minimum, `domain` or `website` is required. All other fields are optional.

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
| `linkedin_people` | string/array | LinkedIn profile URLs for key people |
| `contact_page_url` | string | URL of the contact page |
| `source_urls` | string/array | URLs where lead was found |
| `evidence_snippet` | string | Text snippet supporting the match |
| `match_score` | number | Relevance score (0-100) |
| `notes` | string | Additional notes |

## Example

```json
{
  "domain": "example.com",
  "business_name": "Example Corp",
  "website": "https://example.com",
  "email": "info@example.com",
  "city": "Austin",
  "state": "TX",
  "category": "SaaS",
  "match_score": 85
}
```

## Request Details

- **Method**: POST
- **URL**: `{{BASE_URL}}/api/leads`
- **Auth**: Bearer token via `MOLTBOT_GATEWAY_TOKEN`
- **Response**: `{ "ok": true, "domain": "example.com" }`
