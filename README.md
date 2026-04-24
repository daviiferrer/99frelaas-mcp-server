<p align="center">
  <img src="icone.png" alt="99Freelas MCP Server logo" width="112" />
</p>

<h1 align="center">99Freelas MCP Server</h1>

<p align="center">
  MCP adapter for 99Freelas with local <code>stdio</code> support, remote Streamable HTTP support, encrypted session storage, and request-scoped operating controls.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#remote-http">Remote HTTP</a> |
  <a href="#render-deploy">Render Deploy</a> |
  <a href="#vps-deploy">VPS Deploy</a> |
  <a href="#tools">Tools</a> |
  <a href="#security-model">Security</a>
</p>

## Overview

This server exposes a focused Model Context Protocol interface for operating a 99Freelas account from an agent runtime. It keeps orchestration policy outside the MCP and provides deterministic tools for account sessions, project discovery, bid context, proposals, inbox workflows, profile updates, prompts, and reference resources.

The server supports two official MCP transport styles:

- `stdio` for local clients that spawn the process directly.
- Streamable HTTP for remote clients.

The HTTP transport is intended for deployments such as Render. The health route is deliberately separate from MCP so the hosting platform can verify liveness without credentials.

## Capabilities

- Encrypted cookie/session storage at rest.
- Account-scoped sessions using `accountId`.
- Agent correlation metadata using `agentId`.
- Project listing, availability scanning, detail pages, and bid context.
- Proposal sending with duplicate protection and dry-run support.
- Inbox conversation listing, thread reads, replies, directory counts, and notifications.
- Account dashboard, connection balance, and subscription status.
- Profile edit-state inspection, profile updates, public profile reads, and validated skill IDs.
- MCP prompts and resources for agent-oriented workflows.
- Render-ready `/healthz` route and `render.yaml` blueprint.

## Quick Start

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Set `SESSION_ENCRYPTION_KEY_BASE64` to a base64 value that decodes to exactly 32 bytes.

Generate one with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run the local `stdio` MCP server:

```bash
npm run dev
```

Use this mode when your MCP client starts the server as a local child process.

## Remote HTTP

Run the Streamable HTTP MCP server locally:

```bash
npm run dev:http
```

MCP endpoint:

```text
POST   /mcp
GET    /mcp
DELETE /mcp
```

Health endpoint:

```text
GET /healthz
```

## Render Deploy

This repository includes [render.yaml](render.yaml) for Blueprint-based deploys.

Render settings:

- Runtime: Docker
- Health check path: `/healthz`
- MCP URL: `https://<your-service>.onrender.com/mcp`
- Start command: Dockerfile default, `node dist/http.js`

Required Render environment variables:

```env
SESSION_ENCRYPTION_KEY_BASE64=...
STATE_DB_FILE=.data/state.sqlite
```

Recommended persistent disk variables:

```env
STATE_DB_FILE=.data/state.sqlite
STATE_DB_JOURNAL_MODE=DELETE
LOG_FILE=.data/server.log
MANUAL_COOKIES_FILE=.data/manual-cookies.json
```

The included Blueprint already defines a `/app/.data` disk and sets these paths. Render preserves values marked with `sync: false`, so secrets should be entered in the Render dashboard.

## VPS Deploy

The production path is webhook-driven. GitHub sends a push event to the VPS, the server verifies the signature, and the same deploy script updates the Swarm service in place.

Expected VPS layout:

```text
/srv/99freelas-mcp-server/
  .git/
  deploy.env
  data/
  scripts/
  src/
```

One-time setup:

1. Clone this repository into `/srv/99freelas-mcp-server`.
2. Copy [`deploy.env.example`](./deploy.env.example) to `/srv/99freelas-mcp-server/deploy.env` and fill the values.
3. Create a GitHub webhook for `push` events targeting `https://<your-mcp-host>/webhooks/github`.
4. Set the webhook secret in `GITHUB_WEBHOOK_SECRET`.
5. Start the service with `docker service create` or the existing Swarm deploy flow.

Example `deploy.env` contents:

```env
MCP_HOSTNAME=mcp.example.com
SESSION_ENCRYPTION_KEY_BASE64=...
NINETY_NINE_BASE_URL=https://www.99freelas.com.br
ALLOW_MANUAL_COOKIE_FALLBACK=false
GITHUB_WEBHOOK_SECRET=...
GITHUB_WEBHOOK_BRANCH=master
GITHUB_WEBHOOK_REPOSITORY=daviiferrer/99frelaas-mcp-server
GITHUB_WEBHOOK_PATH=/webhooks/github
```

The deploy script is [`scripts/deploy-vps.sh`](./scripts/deploy-vps.sh). It fetches `master`, rebuilds the image, and updates the running Swarm service without relying on GitHub Actions.

## Docker

Build the image:

```bash
npm run docker:build
```

Run the HTTP container:

```bash
npm run docker:run
```

Or use Compose:

```bash
docker compose up --build
```

The container entrypoint runs the HTTP transport. For local `stdio`, use `npm run dev` directly from the repository.

## Environment

Minimum required variables:

```env
SESSION_ENCRYPTION_KEY_BASE64=...
STATE_DB_FILE=.data/state.sqlite
```

Optional technical variables:

```env
HOST=0.0.0.0
PORT=3000
MCP_HTTP_PATH=/mcp
NINETY_NINE_BASE_URL=https://www.99freelas.com.br
STATE_DB_FILE=.data/state.sqlite
STATE_DB_JOURNAL_MODE=WAL
RATE_LIMIT_REQUESTS_PER_MINUTE=60
ALLOW_MANUAL_COOKIE_FALLBACK=false
MANUAL_COOKIES_FILE=.data/manual-cookies.json
LOG_LEVEL=info
LOG_FILE=.data/server.log
LOG_STDERR=false
```

Legacy migration variables, only needed if old JSON state files still exist:

```env
SESSION_FILE=.data/sessions.json
CACHE_FILE=.data/cache.json
```

Business policy should be passed by request, not as global environment. For example, `proposalsDailyLimit` and `operationTimeZone` are optional fields on `proposals_send`.

## Session Management

Authentication is based on imported 99Freelas browser cookies. Raw cookies are never returned by tools.

Recommended flow:

1. Export cookies from your browser.
2. Call `auth_importCookies` with `cookiesJson`, `cookies`, or `filePath`.
3. Call `auth_checkSession`.
4. Use authenticated tools with the same `accountId`.

Sessions are isolated by `accountId`, which lets one MCP process manage multiple account namespaces. Operational state is persisted in SQLite, including session records, dedupe markers, audit records, rate-limit windows, and request-scoped proposal counters when used.

## Security Model

This server is designed for trusted agent runtimes, not anonymous public use.

- `/healthz` is public and returns only liveness metadata.
- Session cookies are encrypted with `SESSION_ENCRYPTION_KEY_BASE64`.
- Logs and audit events redact sensitive values.
- Proposal and message duplicate checks are enforced by the MCP.
- Negotiation policy, budgets, approvals, and campaign rules belong in the calling agent or orchestration layer.

Treat `SESSION_ENCRYPTION_KEY_BASE64` as a production secret.

## Tools

Authentication:

- `auth_importCookies`
- `auth_checkSession`
- `auth_clearSession`
- `auth_listSessions`

Projects and proposals:

- `projects_listCategories`
- `projects_list`
- `projects_listByAvailability`
- `projects_get`
- `projects_getBidContext`
- `proposals_send`

Inbox and notifications:

- `inbox_listConversations`
- `inbox_getMessages`
- `inbox_getThread`
- `inbox_sendMessage`
- `inbox_getDirectoryCounts`
- `notifications_list`

Account:

- `account_getConnections`
- `account_getDashboardSummary`
- `account_getSubscriptionStatus`

Profile and skills:

- `profile_getInterestCatalog`
- `profile_getEditState`
- `profile_update`
- `profiles_get`
- `skills_getCatalog`
- `skills_getStacks`
- `skills_getSelectionGuide`

System:

- `system_health`

## Prompts

- `screen_projects_for_fit`
- `analyze_project`
- `draft_proposal`
- `reply_inbox`
- `monitor_account`
- `refine_profile_skills`
- `review_99freelas_policies`

## Resources

- `resource://99freelas/server-manifest`
- `resource://99freelas/tool-catalog`
- `resource://99freelas/prompt-catalog`
- `resource://99freelas/operating-playbook`
- `resource://99freelas/quickstart`
- `resource://99freelas/skills-catalog`
- `resource://99freelas/skills-stacks`
- `resource://99freelas/skills-selection-guide`
- `resource://99freelas/policies-summary`

Resource templates:

- `resource://99freelas/skills-catalog/page/{offset}`
- `resource://99freelas/skills-catalog/search/{query}`

## Agent Workflow

Recommended project flow:

1. `projects_list` or `projects_listByAvailability`
2. Shortlist only high-fit items from list-level fields.
3. `projects_get` for shortlisted projects.
4. `profiles_get` when client context changes the decision.
5. `projects_getBidContext`.
6. `proposals_send` with `dryRun=true` when uncertain.
7. `proposals_send` without dry-run only when the bid context is eligible.

Recommended inbox flow:

1. `inbox_getDirectoryCounts`
2. `inbox_listConversations`
3. `inbox_getThread`
4. `inbox_sendMessage`

The MCP executes scoped operations. The consuming agent should own long-running reasoning, schedules, approvals, campaign memory, and business strategy.

## Development

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Run local `stdio`:

```bash
npm run dev
```

Run local HTTP:

```bash
npm run dev:http
```

## License

MIT
