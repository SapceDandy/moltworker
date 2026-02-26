---
name: fetch-page
description: Fetch the raw HTML/text content for a URL. Use this instead of browser automation for all web access including Google Sheets, websites, articles, and any HTTP resource.
type: http
request:
  method: GET
  url: "{{url}}"
  headers:
    User-Agent: "Mozilla/5.0 (compatible; KudjoScout/1.0)"
response:
  type: text
---

# Fetch Page

Use this skill to access ANY web URL. This is your primary tool for web access — do NOT attempt browser automation, use this skill instead.

Works for: websites, Google Sheets (published/shared links), articles, APIs, any HTTP URL.

## Usage

Provide a `url` to fetch. Returns the raw HTML/text content of the page.

## Examples

- `fetch-page url=https://example.com/about`
- `fetch-page url=https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv`
- `fetch-page url=https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?tqx=out:csv`

## Important

- Always use this skill for web access. Do NOT use browser automation.
- For Google Sheets, use the `/export?format=csv` or `/gviz/tq?tqx=out:csv` URL pattern to get structured data.
