---
name: export-csv
description: Download all leads from the database as a CSV file. Returns comma-separated data sorted by match score.
---

# Export Leads CSV

Download the entire leads database as a CSV file. Results are sorted by match score (highest first), then by last updated date.

## Usage

No parameters needed. The skill fetches all leads and returns them as CSV text.

## Example

```
Export all leads as CSV
```

## CSV Columns

`domain`, `business_name`, `website`, `phone`, `email`, `city`, `state`, `category`, `owner_or_people`, `linkedin_company`, `linkedin_people`, `contact_page_url`, `source_urls`, `evidence_snippet`, `match_score`, `notes`, `created_at`, `updated_at`

## Request Details

- **Method**: GET
- **URL**: `${BASE_URL}/api/export.csv`
- **Auth**: Bearer token via `MOLTBOT_GATEWAY_TOKEN`
- **Response**: CSV text file
