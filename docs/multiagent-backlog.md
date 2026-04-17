# Multiagent Readiness Backlog

## Goal
Prepare this MCP server to run as a reliable execution layer for a harness that coordinates:
- multiple accounts
- multiple specialized agents per account
- continuous operation with explicit guardrails

The MCP remains the execution adapter. The harness remains the orchestrator.

## Current Gaps
1. Shared single active session model.
2. Shared dedupe/cache state across contexts.
3. Process-level rate limit only.
4. Automatic manual-cookie fallback can hide context errors.
5. File-based JSON storage without transactional concurrency guarantees.

## Phase 1 - Account Isolation (in progress)
### Scope
- Add `accountId` execution context handling in the server.
- Isolate session state by `accountId`.
- Isolate dedupe/cache state by `accountId`.
- Namespace daily proposal counters by account.
- Disable manual-cookie fallback by default (`ALLOW_MANUAL_COOKIE_FALLBACK=false`).

### Acceptance Criteria
1. Two accounts can import cookies and keep isolated sessions.
2. Proposal/message dedupe in account A does not affect account B.
3. Daily proposal limit is evaluated per account.
4. Auth-required tools fail fast without hidden fallback unless explicitly enabled.

### Tests
- SessionStore account isolation tests.
- CacheStore account isolation tests.
- SessionManager account isolation tests.
- Server fallback test with explicit env opt-in.

## Phase 2 - Multiagent Coordination by Account
### Status
- `accountId` and `agentId` are already part of the tool contract.
- Per-account session/cache isolation is in place.
- `agentId` is treated as harness metadata, not as MCP policy.

### Scope
- Keep `agentId` optional for write and semi-write tools as correlation metadata.
- Keep MCP runtime free from business ownership and budget policy.
- Expand audit records with `accountId` and `agentId`.
- Ensure authenticated requests use request-scoped clients so multiple accounts can run in parallel safely.

### Acceptance Criteria
1. Two agents in the same account do not cause duplicate writes.
2. Two accounts can execute authenticated tools in parallel without sharing cookies.
3. Agent-specific coordination remains the responsibility of the harness, not the MCP runtime.

### Tests
- Concurrency-style duplicate message/proposal scenarios per account.
- Request-scoped HTTP/session isolation tests.
- Audit correlation tests with `agentId`.

## Phase 3 - Durable State and Concurrency Safety
### Scope
- Replace JSON session/cache persistence with SQLite transactional stores.
- Add lock-safe writes for session, dedupe, budgets, and counters.
- Add migration from legacy JSON files.

### Acceptance Criteria
1. Server restart preserves all account-scoped state.
2. Concurrent writes do not corrupt dedupe/session state.
3. Legacy JSON state can be migrated without account data loss.

### Tests
- Migration tests.
- Restart persistence tests.
- Concurrent write safety tests.

## Phase 4 - 24/7 Operations Surface for Harness
### Scope
- Add operational status resources (per account health and budgets).
- Add optional queue-friendly endpoints/resources for pending actions.
- Add richer policy/safety summaries for orchestrator guardrails.

### Acceptance Criteria
1. Harness can query operational status before running loops.
2. Unsafe actions are detectable before execution.
3. Monitoring resources remain lightweight and stable.

### Tests
- Prompt/resource contract tests.
- Operational status smoke tests in Docker.

## Non-Goals
- Moving orchestration logic into MCP.
- Replacing the harness with MCP prompts.
- Fully autonomous decisioning inside the MCP server.
