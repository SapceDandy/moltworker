---
name: company-research
description: Store and retrieve structured company research intel linked to leads. Use this after gathering research on any company.
type: http
request:
  method: POST
  url: "${WORKER_URL}/api/research"
  headers:
    Content-Type: application/json
    Authorization: "Bearer ${MOLTBOT_GATEWAY_TOKEN}"
  body: "{{research_json}}"
response:
  type: json
---

# Company Research Manager

Store structured research about companies/leads. Every piece of intel you gather should be saved here so Devon can review it in the Research UI.

## Endpoints

- **List**: `GET /api/research?lead_id={id}&category={category}` — get all research for a lead
- **Summary**: `GET /api/research/summary/{lead_id}` — get counts per category
- **Save**: `POST /api/research` — create one or more entries
- **Update**: `PUT /api/research/{id}` — update an entry
- **Delete**: `DELETE /api/research/{id}` — remove an entry
- **Batch**: `POST /api/research` with `{ "entries": [...] }` — save multiple at once

## Categories

Use these exact category values:

| Category | Use For |
|----------|---------|
| `company_overview` | What they do, company size, years in business, revenue estimate, service area, specialties |
| `online_presence` | Website quality, Google reviews, social media activity, SEO observations, tech stack |
| `key_people` | Decision makers, owners, managers — names, titles, LinkedIn profiles |
| `pain_points` | Identified problems, outdated systems, growth constraints, opportunities for our services |
| `competition` | Who else serves them, their current vendors, market positioning |
| `recent_activity` | News, job postings, expansions, awards, social media posts, PR |
| `contact_intel` | Verified emails, direct phone numbers, best contact method, office hours |
| `custom` | Anything that doesn't fit above |

## Fields

```json
{
  "lead_id": "uuid (required — must match an existing lead)",
  "category": "company_overview | online_presence | key_people | pain_points | competition | recent_activity | contact_intel | custom",
  "title": "Brief summary of the finding (required)",
  "content": "Full details — be specific, include numbers and quotes when possible (required)",
  "source_url": "URL where you found this info (optional but strongly preferred)",
  "source_label": "Human-readable source name, e.g. 'Google Reviews', 'LinkedIn', 'Company Website' (optional)",
  "confidence": "high | medium | low (how certain you are this info is current and accurate)",
  "gathered_by": "agent | manual (use 'agent' when you gather it)"
}
```

## Research Process

When researching a company, follow this workflow:

1. **Check existing research first**: `GET /api/research?lead_id={id}` — don't duplicate what's already there
2. **Gather intel** using web_search, fetch-page, and browser tools
3. **Save each finding** as a separate entry with the right category
4. **Use batch saves** when you have multiple findings: `POST /api/research` with `{ "entries": [...] }`
5. **Always include source_url** when possible — Devon needs to verify claims
6. **Set confidence accurately**: `high` = verified from official source, `medium` = inferred from public data, `low` = secondhand or possibly outdated

## Research Priorities

When Devon asks you to research a company, cover these in order:

1. **Company Overview** — what they do, size, location, specialties
2. **Key People** — who makes decisions, owner names, LinkedIn
3. **Online Presence** — website quality, reviews, social media
4. **Pain Points** — signs they need help (outdated site, bad reviews, hiring)
5. **Contact Intel** — how to reach them
6. **Recent Activity** — anything new or noteworthy

## Example: Batch Save

```json
{
  "entries": [
    {
      "lead_id": "abc-123",
      "category": "company_overview",
      "title": "HVAC company serving Austin metro, est. 2012",
      "content": "Full-service residential and commercial HVAC. 25+ employees based on LinkedIn. BBB accredited. Service area: Austin, Round Rock, Cedar Park, Georgetown.",
      "source_url": "https://example-hvac.com/about",
      "source_label": "Company Website",
      "confidence": "high"
    },
    {
      "lead_id": "abc-123",
      "category": "online_presence",
      "title": "Strong Google presence, 4.8 stars, 230+ reviews",
      "content": "Google Business Profile is well-maintained. 4.8 star rating with 234 reviews. Website looks modern but slow (8s load time). No blog. Facebook page active with weekly posts. No LinkedIn company page.",
      "source_url": "https://google.com/maps/place/example-hvac",
      "source_label": "Google Reviews",
      "confidence": "high"
    },
    {
      "lead_id": "abc-123",
      "category": "key_people",
      "title": "Owner: John Smith, active on LinkedIn",
      "content": "John Smith, Owner & President. LinkedIn: linkedin.com/in/johnsmith. Also found: Sarah Smith (Office Manager), Mike Johnson (Service Manager).",
      "source_url": "https://linkedin.com/in/johnsmith",
      "source_label": "LinkedIn",
      "confidence": "high"
    }
  ]
}
```

## Important

- **Every piece of research you gather MUST be saved here** — don't just report findings in chat without storing them
- **Check for duplicates** before saving — don't add the same info twice
- **Update existing entries** if you find newer/better information: `PUT /api/research/{id}`
- **Be specific** — "they have a website" is useless; "WordPress site, last updated 2024, no SSL, 12s load time" is valuable
