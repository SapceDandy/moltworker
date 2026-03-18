---
name: linkedin-outreach
description: LinkedIn outreach automation via headless browser. Send connection requests, view profiles, and manage outreach using OpenClaw browser tools.
---

# LinkedIn Outreach

Automate LinkedIn connection requests and profile research using the built-in browser tools.

## Important Constraints

- **Rate limits**: Maximum 20 connection requests per day. LinkedIn will restrict your account if you exceed this.
- **Human-like pacing**: Wait 3-10 seconds between actions. Never rapid-fire requests.
- **Personalization required**: Every connection request MUST include a personalized note referencing something specific about the person or their company.
- **Session check**: Always verify you're logged in before taking actions. If not logged in, stop and notify the owner.

## Cookie Injection (Required Before Every Session)

Before any LinkedIn navigation, inject stored cookies:

1. Fetch cookies from the API:
```
GET ${WORKER_URL}/api/browser/cookies/linkedin.com
Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}
```

2. Inject each cookie into the browser:
```
browser cookies --set '[{"name":"li_at","value":"...","domain":".linkedin.com","path":"/","secure":true,"httpOnly":true}]'
```

3. If the API returns 404 (no cookies stored), STOP and tell the owner:
   "No LinkedIn cookies stored. Please export your LinkedIn cookies and import them at /_admin/#/settings"

## Workflow: Send Connection Requests

### 1. Check login status
```
browser navigate https://www.linkedin.com/feed/
browser snapshot
```
If you see a login form instead of the feed, STOP and tell the owner: "LinkedIn session expired. Please re-export your cookies and import them at /_admin/#/settings"

### 2. Search for a person
```
browser navigate https://www.linkedin.com/search/results/people/?keywords=ENCODED_SEARCH_TERM
browser snapshot
```

### 3. View a profile
```
browser navigate https://www.linkedin.com/in/PROFILE_SLUG/
browser snapshot
```
Gather intel: role, company, recent posts, mutual connections.

### 4. Send connection request
From the profile page:
```
browser snapshot
browser click [Connect button ref]
browser snapshot
browser click [Add a note button ref]
browser type [note field ref] "PERSONALIZED_MESSAGE"
browser click [Send button ref]
```

### 5. Log the touch
After sending, update the cadence touch log via the sales-cadence skill:
```
PUT ${WORKER_URL}/api/cadence/touches/{touchId}
{ "status": "completed", "outcome": "good", "outcome_notes": "Connection request sent with personalized note" }
```

## Connection Message Templates

Adapt these based on lead intel. NEVER send generic messages.

**For HVAC/plumbing businesses (our ICP):**
> Hi {first_name}, I noticed {company} serves the {city} area. We help service businesses like yours get more qualified leads through AI-powered marketing. Would love to connect.

**For business owners with active LinkedIn presence:**
> Hi {first_name}, I enjoyed your recent post about {topic}. We work with {industry} companies on AI-driven growth strategies. Would love to exchange ideas.

**For referral/mutual connection:**
> Hi {first_name}, I see we're both connected with {mutual}. I help {industry} businesses streamline their operations with AI. Would love to connect.

## Profile Research Workflow

When preparing for outreach, gather intel:
1. Navigate to the person's profile
2. Take a snapshot and note: title, company, location, recent activity
3. Check company page for size, industry, recent news
4. Use this intel to personalize the connection message
5. Save research notes to the lead record via save-lead skill

## Error Handling

- **"Connect" button not visible**: Person may already be a connection or have restrictions. Skip and move to next lead.
- **LinkedIn CAPTCHA**: Stop immediately and notify the owner. Do not attempt to solve CAPTCHAs.
- **Rate limit warning**: If LinkedIn shows any warning about connection limits, stop all outreach for 24 hours.
- **Page not loading**: Wait 5 seconds and retry once. If still failing, report the issue.
