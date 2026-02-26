---
name: export-csv
description: Download all leads from the database as a CSV file. Returns comma-separated data sorted by match score.
type: http
request:
  method: GET
  url: "${BASE_URL}/api/export.csv"
  headers:
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
response:
  type: text
---

# Export Leads CSV

Download the entire leads database as a CSV file. Sorted by match score (highest first).

## Usage

No parameters needed.

## Example

```
export-csv
```

## CSV Columns

`domain`, `business_name`, `website`, `phone`, `email`, `city`, `state`, `category`, `owner_or_people`, `linkedin_company`, `linkedin_people`, `contact_page_url`, `source_urls`, `evidence_snippet`, `match_score`, `notes`, `created_at`, `updated_at`
