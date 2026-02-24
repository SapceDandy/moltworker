---
name: fetch-page
description: Fetch the raw HTML/text content for a URL. Useful for scraping web pages, reading articles, or extracting data from websites.
---

# Fetch Page

Fetch the raw HTML or text content from any URL. Use this when you need to read a web page, scrape content, or extract information from a website.

## Usage

Provide a `url` to fetch. The skill will make a GET request and return the page content as text.

## Example

```
Fetch the page at https://example.com/about
```

## Request Details

- **Method**: GET
- **URL**: `{{url}}`
- **Headers**: Sends a standard browser-like User-Agent
- **Response**: Raw HTML/text content of the page
