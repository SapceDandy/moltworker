---
name: search-tavily
description: Search the web using Tavily and return results with URLs/snippets. Use this for all web searches instead of browser automation.
type: http
request:
  method: POST
  url: https://api.tavily.com/search
  headers:
    Content-Type: application/json
  body:
    api_key: "${TAVILY_API_KEY}"
    query: "{{query}}"
    search_depth: "basic"
    max_results: 10
    include_answer: false
    include_images: false
response:
  type: json
---

# Tavily Web Search

Use this skill for ALL web searches. Do NOT use browser automation for searching.

## Usage

Provide a `query` string. Returns JSON with URLs and text snippets.

## Examples

- `search-tavily query="best CRM software for small business"`
- `search-tavily query="site:linkedin.com company CEO Austin TX"`

## Configuration

Requires the `TAVILY_API_KEY` environment variable.
