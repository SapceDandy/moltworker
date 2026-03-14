# Agent Instructions

Guidelines for AI agents working on this codebase.

## Project Overview

This is a Cloudflare Worker that runs [OpenClaw](https://github.com/openclaw/openclaw) (formerly Moltbot/Clawdbot) in a Cloudflare Sandbox container. It provides:
- Proxying to the OpenClaw gateway (web UI + WebSocket)
- Admin UI at `/_admin/` for device management
- API endpoints at `/api/*` for device pairing
- Debug endpoints at `/debug/*` for troubleshooting
- **Executive assistant** ("Kudjo"): D1-backed project/task/goal management with cron-driven daily briefs, evening recaps, and weekly reviews
- **Sales cadence system**: 14-stage cold outbound pipeline with AI call prep briefs, email tracking (open pixel + Gmail thread reply detection), multi-view client UI (queue, pipeline funnel, lead detail, weekly calendar)

**Note:** The CLI tool and npm package are now named `openclaw`. Config files use `.openclaw/openclaw.json`. Legacy `.clawdbot` paths are supported for backward compatibility during transition.

## Project Structure

```
src/
├── index.ts          # Main Hono app, route mounting
├── types.ts          # TypeScript type definitions
├── config.ts         # Constants (ports, timeouts, paths)
├── auth/             # Cloudflare Access authentication
│   ├── jwt.ts        # JWT verification
│   ├── jwks.ts       # JWKS fetching and caching
│   └── middleware.ts # Hono middleware for auth
├── gateway/          # OpenClaw gateway management
│   ├── process.ts    # Process lifecycle (find, start)
│   ├── env.ts        # Environment variable building
│   ├── r2.ts         # R2 bucket mounting
│   ├── sync.ts       # R2 backup sync logic
│   └── utils.ts      # Shared utilities (waitForProcess)
├── routes/           # API route handlers
│   ├── api.ts        # /api/* endpoints (devices, gateway, exec assistant)
│   ├── projects.ts   # /api/projects CRUD
│   ├── tasks.ts      # /api/tasks CRUD
│   ├── goals.ts      # /api/goals + /api/milestones CRUD
│   ├── checkins.ts   # /api/checkins + /api/blockers CRUD
│   ├── reminders.ts  # /api/reminders CRUD
│   ├── dashboard.ts  # /api/dashboard aggregate + snapshot
│   ├── cadence.ts    # /api/cadence/* sales pipeline, stages, cadences, touches, AI call prep, tracking pixel
│   ├── agent-logs.ts # /api/agent-logs read-only query
│   ├── admin.ts      # /_admin/* static file serving
│   └── debug.ts      # /debug/* endpoints
├── cron/             # Scheduled event handlers
│   ├── index.ts      # Cron dispatch by expression
│   ├── morning-brief.ts  # 7am CT weekdays (includes sales cadence data)
│   ├── evening-recap.ts  # 5pm CT weekdays
│   ├── weekly-review.ts  # 5pm CT Sunday
│   ├── check-replies.ts  # Every 15 min Gmail thread reply check
│   └── keep-warm.ts      # Every 5 min sandbox ping
└── client/           # React admin UI (Vite)
    ├── App.tsx
    ├── api.ts        # API client
    └── pages/
skills/               # OpenClaw skill definitions (copied into container)
├── project-manager/  # CRUD for projects, tasks, goals, milestones, blockers, reminders
├── sales-cadence/    # Sales pipeline, cadences, touches, AI call prep briefs
├── daily-brief/      # Fetch aggregated dashboard data
├── save-lead/        # Upsert lead to D1
└── fetch-page/       # Fetch any URL
workspace/            # OpenClaw bootstrap files (copied into container)
├── SOUL.md           # Agent personality, rules, daily rhythms
└── USER.md           # Owner profile and preferences
migrations/           # D1 schema migrations
├── 0001_leads.sql
├── 0002_executive_assistant.sql
└── 0005_sales_cadence.sql   # sales_pipelines, pipeline_stages, sales_cadences, touch_log, campaign_metrics
```

## Key Patterns

### Environment Variables

- `DEV_MODE` - Skips CF Access auth AND bypasses device pairing (maps to `OPENCLAW_DEV_MODE` for container)
- `DEBUG_ROUTES` - Enables `/debug/*` routes (disabled by default)
- See `src/types.ts` for full `MoltbotEnv` interface

### CLI Commands

When calling the OpenClaw CLI from the worker, always include `--url ws://localhost:18789`:
```typescript
sandbox.startProcess('openclaw devices list --json --url ws://localhost:18789')
```

CLI commands take 10-15 seconds due to WebSocket connection overhead. Use `waitForProcess()` helper in `src/routes/api.ts`.

### Success Detection

The CLI outputs "Approved" (capital A). Use case-insensitive checks:
```typescript
stdout.toLowerCase().includes('approved')
```

## Commands

```bash
npm test              # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
npm run build         # Build worker + client
npm run deploy        # Build and deploy to Cloudflare
npm run dev           # Vite dev server
npm run start         # wrangler dev (local worker)
npm run typecheck     # TypeScript check
```

## Testing

Tests use Vitest. Test files are colocated with source files (`*.test.ts`).

Current test coverage:
- `auth/jwt.test.ts` - JWT decoding and validation
- `auth/jwks.test.ts` - JWKS fetching and caching
- `auth/middleware.test.ts` - Auth middleware behavior
- `gateway/env.test.ts` - Environment variable building
- `gateway/process.test.ts` - Process finding logic
- `gateway/r2.test.ts` - R2 mounting logic
- `gateway/sync.test.ts` - R2 backup sync logic
- `routes/projects.test.ts` - Projects CRUD + filtering
- `routes/tasks.test.ts` - Tasks CRUD + filtering
- `routes/goals.test.ts` - Goals + milestones CRUD
- `routes/checkins.test.ts` - Check-ins + blockers CRUD
- `routes/reminders.test.ts` - Reminders CRUD
- `routes/dashboard.test.ts` - Dashboard summary + snapshot
- `routes/agent-logs.test.ts` - Agent logs query
- `cron/index.test.ts` - Cron dispatch routing

Route tests use `app.request(path, init, env)` with a `req()` helper. An in-memory D1 mock (`src/test-utils-d1.ts`) simulates basic SQL.

When adding new functionality, add corresponding tests.

## Code Style

- Use TypeScript strict mode
- Prefer explicit types over inference for function signatures
- Keep route handlers thin - extract logic to separate modules
- Use Hono's context methods (`c.json()`, `c.html()`) for responses

## Documentation

- `README.md` - User-facing documentation (setup, configuration, usage)
- `AGENTS.md` - This file, for AI agents

Development documentation goes in AGENTS.md, not README.md.

---

## Architecture

```
Browser
   │
   ▼
┌─────────────────────────────────────┐
│     Cloudflare Worker (index.ts)    │
│  - Starts OpenClaw in sandbox       │
│  - Proxies HTTP/WebSocket requests  │
│  - Passes secrets as env vars       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     Cloudflare Sandbox Container    │
│  ┌───────────────────────────────┐  │
│  │     OpenClaw Gateway          │  │
│  │  - Control UI on port 18789   │  │
│  │  - WebSocket RPC protocol     │  │
│  │  - Agent runtime              │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Worker that manages sandbox lifecycle and proxies requests |
| `Dockerfile` | Container image based on `cloudflare/sandbox` with Node 22 + OpenClaw |
| `start-openclaw.sh` | Startup script: R2 restore → onboard → config patch → launch gateway |
| `wrangler.jsonc` | Cloudflare Worker + Container configuration |

## Local Development

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your ANTHROPIC_API_KEY
npm run start
```

### Environment Variables

For local development, create `.dev.vars`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
DEV_MODE=true           # Skips CF Access auth + device pairing
DEBUG_ROUTES=true       # Enables /debug/* routes
```

### WebSocket Limitations

Local development with `wrangler dev` has issues proxying WebSocket connections through the sandbox. HTTP requests work but WebSocket connections may fail. Deploy to Cloudflare for full functionality.

## Docker Image Caching

The Dockerfile includes a cache bust comment. When changing `start-openclaw.sh`, bump the version:

```dockerfile
# Build cache bust: 2026-02-06-v28-openclaw-upgrade
```

## Gateway Configuration

OpenClaw configuration is built at container startup:

1. R2 backup is restored if available (with migration from legacy `.clawdbot` paths)
2. If no config exists, `openclaw onboard --non-interactive` creates one based on env vars
3. `start-openclaw.sh` patches the config for channels, gateway auth, and trusted proxies
4. Gateway starts with `openclaw gateway --allow-unconfigured --bind lan`

### AI Provider Priority

The startup script selects the auth choice based on which env vars are set:

1. **Cloudflare AI Gateway** (native): `CLOUDFLARE_AI_GATEWAY_API_KEY` + `CF_AI_GATEWAY_ACCOUNT_ID` + `CF_AI_GATEWAY_GATEWAY_ID`
2. **Direct Anthropic**: `ANTHROPIC_API_KEY` (optionally with `ANTHROPIC_BASE_URL`)
3. **Direct OpenAI**: `OPENAI_API_KEY`
4. **Legacy AI Gateway**: `AI_GATEWAY_API_KEY` + `AI_GATEWAY_BASE_URL` (routes through Anthropic base URL)

### Container Environment Variables

These are the env vars passed TO the container (internal names):

| Variable | Config Path | Notes |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | (env var) | OpenClaw reads directly from env |
| `OPENAI_API_KEY` | (env var) | OpenClaw reads directly from env |
| `CLOUDFLARE_AI_GATEWAY_API_KEY` | (env var) | Native AI Gateway key |
| `CF_AI_GATEWAY_ACCOUNT_ID` | (env var) | Account ID for AI Gateway |
| `CF_AI_GATEWAY_GATEWAY_ID` | (env var) | Gateway ID for AI Gateway |
| `OPENCLAW_GATEWAY_TOKEN` | `--token` flag | Mapped from `MOLTBOT_GATEWAY_TOKEN` |
| `MOLTBOT_GATEWAY_TOKEN` | (env var) | Also passed as-is for skill Bearer auth |
| `WORKER_URL` | (env var) | Public Worker URL for skill HTTP callbacks |
| `OPENCLAW_DEV_MODE` | `controlUi.allowInsecureAuth` | Mapped from `DEV_MODE` |
| `TELEGRAM_BOT_TOKEN` | `channels.telegram.botToken` | |
| `DISCORD_BOT_TOKEN` | `channels.discord.token` | |
| `SLACK_BOT_TOKEN` | `channels.slack.botToken` | |
| `SLACK_APP_TOKEN` | `channels.slack.appToken` | |

## OpenClaw Config Schema

OpenClaw has strict config validation. Common gotchas:

- `agents.defaults.model` must be `{ "primary": "model/name" }` not a string
- `gateway.mode` must be `"local"` for headless operation
- No `webchat` channel - the Control UI is served automatically
- `gateway.bind` is not a config option - use `--bind` CLI flag

See [OpenClaw docs](https://docs.openclaw.ai/) for full schema.

## Executive Assistant Architecture

### Data Flow

```
Cron trigger (Cloudflare)
   │
   ▼
handleScheduled() ──► morningBrief() / eveningRecap() / weeklyReview()
   │                      │
   │  1. Query D1 ◄───────┘
   │  2. Take snapshot (INSERT progress_snapshots)
   │  3. sendSessionMessage() ──► POST /v1/chat/completions on container
   │                                    │
   │                                    ▼
   │                              OpenClaw agent reads message,
   │                              uses skills to call back:
   │                                    │
   │                              GET/POST ${WORKER_URL}/api/*
   │                              Authorization: Bearer ${MOLTBOT_GATEWAY_TOKEN}
   │                                    │
   │                                    ▼
   │                              Worker auth middleware:
   │                              Bearer token bypass for /api/*
   │                              (skips CF Access, sets agent@internal)
   │                                    │
   │                                    ▼
   └──────────────────────────────────► D1 Database
```

### Auth: Agent → Worker API

The container agent calls back to the Worker's `/api/*` routes using Bearer token auth.
The middleware in `src/index.ts` checks `Authorization: Bearer <token>` against `MOLTBOT_GATEWAY_TOKEN`
and bypasses CF Access for matching requests. This is scoped to `/api/*` paths only.

### RPC: Worker → Agent

`sendSessionMessage()` in `src/gateway/rpc.ts` sends messages to OpenClaw via the
OpenAI-compatible `/v1/chat/completions` HTTP endpoint (enabled in `start-openclaw.sh` config patch).
Uses `x-openclaw-session-key: cron-system` so all cron messages share one session.

### Cron Schedules (wrangler.jsonc)

| Cron | UTC | CT (UTC-6) | Handler |
|------|-----|------------|----------|
| `*/5 * * * *` | Every 5 min | Every 5 min | `keepWarm` |
| `0 13 * * 1-5` | 1:00 PM | 7:00 AM | `morningBrief` |
| `0 23 * * 1-5` | 11:00 PM | 5:00 PM | `eveningRecap` |
| `0 23 * * 7` | 11:00 PM Sun | 5:00 PM Sun | `weeklyReview` |

### D1 Tables (migration 0002)

`projects`, `goals`, `milestones`, `tasks`, `blockers`, `daily_checkins`, `reminders`, `progress_snapshots`, `agent_logs`

### Skills

Skills use `${WORKER_URL}` (env var) for the base URL and `${MOLTBOT_GATEWAY_TOKEN}` for Bearer auth.
The `${}` syntax is resolved from container environment variables at skill execution time.
`{{param}}` syntax is for agent-provided parameters at invocation time.

### Adding a New Executive Assistant Endpoint

1. Add route handler in `src/routes/<resource>.ts`
2. Add tests in `src/routes/<resource>.test.ts` using the `req()` helper pattern
3. Import and mount in `src/routes/api.ts`
4. Document in `skills/project-manager/SKILL.md`
5. If the cron handlers need the data, update the relevant handler in `src/cron/`

## Common Tasks

### Adding a New API Endpoint

1. Add route handler in `src/routes/api.ts`
2. Add types if needed in `src/types.ts`
3. Update client API in `src/client/api.ts` if frontend needs it
4. Add tests

### Adding a New Environment Variable

1. Add to `MoltbotEnv` interface in `src/types.ts`
2. If passed to container, add to `buildEnvVars()` in `src/gateway/env.ts`
3. Update `.dev.vars.example`
4. Document in README.md secrets table

### Debugging

```bash
# View live logs
npx wrangler tail

# Check secrets
npx wrangler secret list
```

Enable debug routes with `DEBUG_ROUTES=true` and check `/debug/processes`.

## R2 Storage Notes

R2 is mounted via s3fs at `/data/moltbot`. Important gotchas:

- **rsync compatibility**: Use `rsync -r --no-times` instead of `rsync -a`. s3fs doesn't support setting timestamps, which causes rsync to fail with "Input/output error".

- **Mount checking**: Don't rely on `sandbox.mountBucket()` error messages to detect "already mounted" state. Instead, check `mount | grep s3fs` to verify the mount status.

- **Never delete R2 data**: The mount directory `/data/moltbot` IS the R2 bucket. Running `rm -rf /data/moltbot/*` will DELETE your backup data. Always check mount status before any destructive operations.

- **Process status**: The sandbox API's `proc.status` may not update immediately after a process completes. Instead of checking `proc.status === 'completed'`, verify success by checking for expected output (e.g., timestamp file exists after sync).

- **R2 prefix migration**: Backups are now stored under `openclaw/` prefix in R2 (was `clawdbot/`). The startup script handles restoring from both old and new prefixes with automatic migration.
