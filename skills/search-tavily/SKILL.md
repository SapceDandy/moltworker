---
name: search-tavily
description: Search the web using Tavily and return results with URLs/snippets.
---

# Tavily Web Search

Search the web using the Tavily API. Returns relevant URLs and text snippets for a given query.

## Usage

Provide a `query` string. The skill will POST to the Tavily search API and return JSON results.

## Configuration

Requires the `TAVILY_API_KEY` environment variable to be set.

## Example

```
Search for "best CRM software for small business"
```

## Request Details

- **Method**: POST
- **URL**: `https://api.tavily.com/search`
- **Body**:
  ```json
  {
    "api_key": "${TAVILY_API_KEY}",
    "query": "{{query}}",
    "search_depth": "basic",
    "max_results": 10,
    "include_answer": false,
    "include_images": false
  }
  ```
- **Response**: JSON with search results
