# 99Freelas MCP Server

Private/local MCP adapter for 99Freelas, built around `stdio` transport and safe, deterministic tool exposure.

## What this server is for

- Private/local integration only.
- Session-based authentication via encrypted cookie import.
- Read-first flows for projects, profiles, inbox, and proposals.
- Guardrails by default: rate limiting, deduplication, dry-run support, audit logs, and redaction.
- Prompt and resource surfaces for agent-oriented consumers.

## Tools

- `auth_importCookies`
- `auth_checkSession`
- `auth_clearSession`
- `profile_getInterestCatalog`
- `profile_getEditState`
- `profile_update`
- `projects_listCategories`
- `projects_list`
- `projects_listByAvailability`
- `projects_get`
- `projects_getBidContext`
- `proposals_send`
- `inbox_listConversations`
- `inbox_getMessages`
- `inbox_getThread`
- `inbox_sendMessage`
- `inbox_getDirectoryCounts`
- `account_getConnections`
- `account_getDashboardSummary`
- `account_getSubscriptionStatus`
- `profiles_get`
- `system_health`

## Prompts

- `analyze_project`
- `draft_proposal`
- `reply_inbox`
- `monitor_account`

## Resources

- `resource://99freelas/server-manifest`
- `resource://99freelas/tool-catalog`
- `resource://99freelas/prompt-catalog`
- `resource://99freelas/quickstart`

## Session Management

The server stores authenticated cookies encrypted at rest and persists operational state in SQLite.

- Export cookies from your browser.
- Save them to `MANUAL_COOKIES_FILE` or pass them directly to `auth_importCookies`.
- If an authenticated tool runs without an active session, the server fails closed unless `ALLOW_MANUAL_COOKIE_FALLBACK=true`.
- Sessions are resolved by `accountId` so the same MCP process can serve multiple accounts in parallel.
- State lives in `STATE_DB_FILE` by default. Legacy JSON session/cache files are imported on first boot if present.
- `STATE_DB_JOURNAL_MODE` defaults to `WAL`. On Docker Desktop bind mounts (especially Windows/macOS host filesystems), prefer `DELETE` to avoid WAL/SHM startup failures.

## Multiagent contract

The harness should pass these identifiers explicitly to the MCP:

- `accountId`: isolates session, cache, and daily counters.
- `agentId`: optional correlation metadata for audit and tracing.

Recommended convention examples:

- `scout:*` for project discovery and read-only research.
- `proposal:*` for proposal drafting and sending.
- `inbox:*` for reading and replying to messages.
- `profile:*` for profile inspection and updates.
- `orchestrator:*` for harness-level coordination and safe overrides.

The MCP does not enforce ownership, budgets, or negotiation rules. Keep that policy in the harness. The MCP only validates tool input, resolves the account-scoped session, executes the request, and returns deterministic output.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `SESSION_ENCRYPTION_KEY_BASE64` with a 32-byte base64 key.
3. Install dependencies with `npm install`.
4. Run in development with `npm run dev`.

## Installation methods

### Local development

```bash
npm install
npm run dev
```

### Docker

Build the image:

```bash
npm run docker:build
```

Run it over `stdio`:

```bash
npm run docker:run
```

Or use Compose:

```bash
docker compose up --build
```

If you want to consume the MCP from another local app, point it at the repository checkout and run the server through the standard `stdio` entrypoint.

## Agent usage

Recommended flow:

1. `projects_list` or `projects_listByAvailability`
2. `projects_get`
3. `profiles_get` when the client context matters
4. `projects_getBidContext`
5. `proposals_send` when the project is eligible
6. `inbox_getThread` before replying to a client

The consuming app should keep the long-running reasoning loop, cron, notifications, and approval logic outside the MCP server.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
