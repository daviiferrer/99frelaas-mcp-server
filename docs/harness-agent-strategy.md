# Harness Agent Strategy (99Freelas)

This document defines a practical operating strategy for a multi-agent harness on top of this MCP server.

The goal is production throughput with control:
- continuous project discovery
- no duplicate work
- account-scoped memory
- message and proposal follow-up
- clear status tracking

## 1) What this is (and is not)

This strategy assumes:
- The MCP server is tool-only.
- Agents are the workers.
- The harness is a lightweight runtime (state + queue + routing), not an "AI boss" that rewrites every decision.

That means:
- no hardcoded business strategy inside MCP
- no hidden pipeline inside MCP
- decisions are made by agents using system prompts and state

## 2) Platform reality (99Freelas) that drives the design

From official 99Freelas pages:
- Normal project flow is: publish -> proposals -> selection -> payment held by platform -> delivery -> release payment -> transfer.
- Disputes are judged with strong weight on project scope, proposal text, and platform chat history.
- Projects may be closed/cancelled even after proposals.
- Platform warns against doing projects outside the site and may ban accounts for it.
- Terms include custody of guaranteed payment and plan-dependent transfer windows (Free/Pro/Premium).
- Privacy policy says platform chat and attachments may be accessed in disputes, and platform does not guarantee security for exchanges outside platform.

See sources at the end of this doc.

Implication for agents:
- keep negotiation and evidence inside platform chat
- preserve traceable states
- do not fabricate historical context
- do not assume one inbox page is the full history

## 3) Core architecture (without central AI orchestrator)

Use a small runtime with deterministic components:

- `ingress workers`:
  - `project_scout`
  - `inbox_scout`
- `analysis workers`:
  - `project_analyst`
  - `client_analyst`
- `action workers`:
  - `proposal_writer`
  - `proposal_sender`
  - `chat_responder`
- `state services`:
  - event log
  - account-scoped memory
  - dedupe index
  - job queue

Each worker is an agent with a system prompt for its role.
Workers communicate by events and job payloads, not by free chat.

## 4) Multi-account model

All state must be namespaced by `accountId`.

Required key shape:
- `accountId` (required)
- `entityType` (`project` | `conversation` | `proposal` | `client`)
- `entityId`

Never mix memory across accounts.

Recommended storage partitions:
- `memory.account.{accountId}.*`
- `events.account.{accountId}.*`
- `jobs.account.{accountId}.*`
- `dedupe.account.{accountId}.*`

## 5) Connection strategy (harness -> MCP)

Use one stable MCP client connection per harness process (stdio to the running container), and pass `accountId` on every authenticated tool call.

Do not depend on global active session.

Expected call pattern:
1. `auth_importCookies` with `accountId` (one time or refresh).
2. `auth_checkSession` before a work batch.
3. business tools always include `accountId`.

## 6) Agent chain (production line)

### A. Project lane

1. `project_scout` (continuous)
- calls `projects_list` / `projects_listByAvailability`
- creates `project.discovered`
- computes a deterministic hash key

2. `project_analyst` (parallel)
- consumes only new discovered projects
- triages from list-level fields first
- opens `projects_get` only for shortlisted items
- emits:
  - `project.shortlisted`
  - `project.rejected`

3. `client_analyst` (optional branch)
- for shortlisted projects only
- calls `profiles_get` when owner/competitor context changes expected decision quality
- emits `project.client_enriched`

4. `proposal_writer`
- prepares structured draft
- emits `proposal.drafted`

5. `proposal_sender`
- runs final checks via `projects_getBidContext`
- sends with `proposals_send` when approved/policy-allowed
- emits:
  - `proposal.sent`
  - `proposal.blocked`
  - `proposal.failed`

### B. Inbox lane

1. `inbox_scout` (continuous)
- paginates `inbox_listConversations` with `start/limit`
- detects new/unread deltas
- emits `conversation.updated`

2. `chat_responder`
- loads `inbox_getThread`
- drafts response
- sends via `inbox_sendMessage` (policy-dependent)
- emits `conversation.replied` or `conversation.waiting`

## 7) Status model (must exist)

Define explicit statuses per entity.

Project status:
- `discovered`
- `triaged_reject`
- `triaged_shortlist`
- `detail_loaded`
- `client_enriched`
- `proposal_drafted`
- `proposal_sent`
- `proposal_blocked`
- `waiting_client_reply`
- `negotiation_active`
- `closed_won`
- `closed_lost`

Conversation status:
- `new`
- `watched`
- `awaiting_agent_reply`
- `replied`
- `awaiting_client_reply`
- `closed`

## 8) Hash + idempotency strategy (no duplicate work)

Use deterministic IDs:

- `projectKey = sha256(accountId + ":" + projectId)`
- `proposalAttemptKey = sha256(accountId + ":" + projectId + ":" + offerCents + ":" + durationDays + ":" + normalizedProposalText)`
- `messageKey = sha256(accountId + ":" + conversationId + ":" + normalizedMessageText)`
- `eventKey = sha256(accountId + ":" + eventType + ":" + entityId + ":" + eventTimestampBucket)`

Rules:
- store processed event keys with TTL
- reject duplicate proposal/message sends when same key already committed
- keep "last processed cursor" per inbox lane worker and account

## 9) Triggering model (what activates agents)

No central "thinking orchestrator" required.
Use deterministic triggers:

- time triggers:
  - `project_scout`: every N minutes
  - `inbox_scout`: every M seconds/minutes

- event triggers:
  - `project.shortlisted` -> `proposal_writer`
  - `proposal.sent` -> set project to `waiting_client_reply`
  - `conversation.updated` with new client message -> `chat_responder`

- state triggers:
  - stale `proposal_drafted` over threshold -> retry or archive decision
  - stale `awaiting_client_reply` -> follow-up policy branch

## 10) Memory model (shared only inside account)

Split memory into:

- `working memory` (short-term):
  - current shortlist
  - active conversation intent
  - pending proposal drafts

- `episodic memory` (mid-term):
  - what tone worked with this client
  - accepted/rejected proposal patterns
  - negotiation outcomes

- `policy memory` (stable):
  - platform constraints
  - forbidden behavior
  - approved reply templates

Never load full historical memory into every prompt.
Inject only account-scoped, task-scoped slices.

## 11) Recommended minimum data schema

`projects` table:
- `account_id`
- `project_id`
- `slug`
- `status`
- `fit_score`
- `last_seen_at`
- `last_event_id`

`conversations` table:
- `account_id`
- `conversation_id`
- `status`
- `last_message_at`
- `last_seen_hash`

`jobs` table:
- `job_id`
- `account_id`
- `agent_role`
- `entity_type`
- `entity_id`
- `state` (`queued|running|done|failed|dead`)
- `attempt`
- `next_run_at`

`events` table:
- `event_id`
- `account_id`
- `event_type`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`

`dedupe` table:
- `dedupe_key`
- `account_id`
- `kind` (`proposal|message|event`)
- `created_at`

## 12) Prompt policy for agents

Agent prompts should enforce:
- list-first triage before detail expansion
- no fabricated history
- account-scoped memory only
- explicit "known vs unknown" output
- required next tool call justification

Use one base prompt template + role overlays.
Do not maintain many divergent prompt versions.

## 13) Rollout strategy

Phase 1:
- `project_scout` + `project_analyst` + status + dedupe

Phase 2:
- `proposal_writer` + `proposal_sender` with approval gate

Phase 3:
- `inbox_scout` pagination + `chat_responder`

Phase 4:
- account-level analytics and adaptive scoring

## 14) Operational metrics

Track per account:
- projects discovered/hour
- shortlist ratio
- detail-open ratio
- proposal send rate
- response latency to client messages
- duplicate block counts
- failed tool call rate by tool name
- win/loss outcome rate

## 15) Sources

- 99Freelas, Project Flow: [https://www.99freelas.com.br/project-flow](https://www.99freelas.com.br/project-flow)
- 99Freelas, Terms: [https://www.99freelas.com.br/termos](https://www.99freelas.com.br/termos)
- 99Freelas, Privacy: [https://www.99freelas.com.br/privacidade](https://www.99freelas.com.br/privacidade)
- 99Freelas, How it works: [https://www.99freelas.com.br/como-funciona](https://www.99freelas.com.br/como-funciona)
- MCP Tools Spec: [https://modelcontextprotocol.io/specification/2025-11-25/server/tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- MCP Transports Spec: [https://modelcontextprotocol.io/specification/2025-11-25/basic/transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- OpenAI Prompt Engineering: [https://developers.openai.com/api/docs/guides/prompt-engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- Anthropic Prompt Templates/Variables: [https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools)
