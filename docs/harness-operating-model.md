# Harness Operating Model

This document describes the recommended operating model for a harness that uses the 99Freelas MCP as a tool-only execution layer.

The goal is not to make MCP "smart". The goal is to make the harness productive, safe, and predictable while the MCP stays focused on execution.

## Core Principle

- The harness is the brain.
- The MCP is the hand.
- The user owns the strategy.

The harness should decide:

- which accounts exist
- which AI agents exist
- which tools each agent may call
- when an agent can act automatically
- when human approval is required
- how memory is stored
- how retries, rate limits, and queues work

The MCP should only:

- accept a request with `accountId`
- resolve the account-scoped session
- execute the requested tool
- return a deterministic result
- emit logs and audit metadata

## Product Goal

The harness should increase freelancer productivity by removing repetitive work:

- finding projects
- filtering bad-fit leads
- reading project details
- checking the client profile
- preparing proposals
- monitoring inbox
- detecting replies and notifications
- drafting contextual responses
- tracking what has already been seen or answered

The user should stop manually scanning the marketplace every hour.

## Main Actors

### User

The user is the account owner. The user should be able to:

- add one or more 99Freelas accounts
- import cookies for each account
- see which account is active where
- approve or reject automation modes
- define preferred niches and budget rules
- define which agents are enabled

### Harness

The harness is the orchestration app. It should:

- store accounts, agents, sessions, memory, and audit
- choose which account a request should use
- decide which agent may call which tool
- manage queues, cadence, and approval gates
- maintain durable memory outside MCP

### MCP

The MCP server executes tool requests. It should:

- persist encrypted cookies by `accountId`
- auto-identify `username` after cookie import when possible
- expose tools, prompts, and resources
- log what happened
- return explicit failures

## Account Model

Each 99Freelas account should be represented by a stable harness record:

- `accountId`
- `label`
- `username`
- `status`
- `lastSessionCheckAt`
- `autoMode`
- `notes`

### Recommended fields

- `accountId`: internal stable key, for example `acc_main_01`
- `label`: user-facing label, for example `Carlos Principal`
- `username`: detected from the authenticated account, for example `carlos-vieira-mkt`
- `status`: `active`, `attention`, `expired`, `paused`
- `autoMode`: `manual`, `assisted`, `semi_auto`, `full_auto`

### Why `accountId` must stay internal

`username` can change in edge cases or may fail to resolve during import. The harness should not use `username` as the primary key. Use it as metadata, not identity.

## Session and Cookie Flow

### Cookie import

1. The user opens the account setup screen.
2. The harness asks for cookies JSON or browser export.
3. The harness calls `auth_importCookies` with a chosen `accountId`.
4. The MCP stores the cookies encrypted.
5. The MCP attempts to identify the authenticated account by reading `/profile/edit`.
6. If the site exposes `Meu perfil -> /user/<username>`, the MCP stores that `username`.
7. The harness calls `auth_checkSession` and stores the returned session metadata.

### What the harness should save after import

- `accountId`
- detected `username`
- cookie source
- last import time
- session status
- any warning returned by the import flow

### Failure mode

If cookie import succeeds but the username is not detected:

- keep the session
- mark the account as `attention`
- allow the harness to confirm the account label manually

This is safer than refusing the import.

## User Flow

### 1. First-time setup

The user should:

- create a workspace
- add one or more 99Freelas accounts
- import cookies for each account
- choose niches or interest profiles
- enable desired agents
- decide automation mode

### 2. Daily operation

The user opens the harness and sees:

- new matching projects
- accounts with valid/invalid session
- inbox conversations needing response
- notifications that changed account state
- proposals drafted but not sent
- actions waiting for approval

### 3. Assisted mode

In assisted mode, agents may:

- scan and shortlist projects
- prepare proposals
- draft chat replies
- update memory

But they should not send proposals or messages without approval.

### 4. Semi-auto mode

In semi-auto mode, agents may:

- scan and shortlist projects
- send proposals under configured rules
- answer inbox under configured rules
- escalate uncertain cases to approval

### 5. Full-auto mode

In full-auto mode, the harness may allow:

- unattended scanning
- unattended proposal sending
- unattended follow-up
- unattended reply drafting and sending

This should only be available after trust is established and logging is strong.

## Agent Model

Agents should not all do everything. Specialization reduces mistakes.

### Recommended agents

- `scout`
- `qualifier`
- `proposal_writer`
- `proposal_sender`
- `inbox_operator`
- `notification_watcher`
- `profile_optimizer`
- `orchestrator`

### Agent responsibilities

#### `scout`

Purpose:

- scan categories
- find recent projects
- create candidate records

Suggested tools:

- `projects_listCategories`
- `projects_list`
- `projects_listByAvailability`
- `projects_get`

#### `qualifier`

Purpose:

- evaluate fit
- read client profile
- score opportunity

Suggested tools:

- `projects_get`
- `projects_getBidContext`
- `profiles_get`
- `account_getDashboardSummary`

#### `proposal_writer`

Purpose:

- draft proposals
- tailor message to project and client
- write internal rationale

Suggested tools:

- read-only tools only

This agent should usually not send.

#### `proposal_sender`

Purpose:

- send approved proposals

Suggested tools:

- `projects_getBidContext`
- `proposals_send`

#### `notification_watcher`

Purpose:

- poll inbox and account state
- detect what changed
- dispatch tasks to other agents

Suggested tools:

- `inbox_listConversations`
- `inbox_getDirectoryCounts`
- `account_getDashboardSummary`
- `account_getSubscriptionStatus`

#### `inbox_operator`

Purpose:

- read full context
- draft or send replies

Suggested tools:

- `inbox_getThread`
- `inbox_getMessages`
- `inbox_sendMessage`
- `projects_get`

#### `profile_optimizer`

Purpose:

- improve fit for desired niches

Suggested tools:

- `profile_getEditState`
- `profile_getInterestCatalog`
- `skills_getCatalog`
- `skills_getStacks`
- `skills_getSelectionGuide`
- `profile_update`

#### `orchestrator`

Purpose:

- assign tasks
- pick account
- enforce approval policy
- update shared memory

This is usually harness logic, not a free-form LLM role.

## Tool Permissions

The harness should define tool permissions outside MCP.

### Suggested permission groups

- `read_marketplace`
- `read_account`
- `read_profile`
- `write_profile`
- `write_proposals`
- `read_inbox`
- `write_inbox`
- `auth_manage`

### Recommended mapping

- `scout`: `read_marketplace`
- `qualifier`: `read_marketplace`, `read_account`
- `proposal_writer`: `read_marketplace`, `read_account`, `read_inbox`
- `proposal_sender`: `write_proposals`, `read_marketplace`, `read_account`
- `notification_watcher`: `read_account`, `read_inbox`
- `inbox_operator`: `read_inbox`, `write_inbox`, `read_marketplace`
- `profile_optimizer`: `read_profile`, `write_profile`

This should be configuration, not hardcoded business logic.

## Shared Memory Model

Yes, agents should share memory. Without it, they will repeat projects, duplicate proposals, and answer chats with missing context.

The best shape is a harness-owned memory layer, not an MCP-owned memory layer.

### Recommended memory objects

- `accounts`
- `projects`
- `clients`
- `conversations`
- `notifications`
- `actions`
- `drafts`
- `rules`

### Minimal useful memory fields

#### Project memory

- `projectId`
- `projectSlug`
- `accountId`
- `firstSeenAt`
- `lastSeenAt`
- `status`: `new`, `qualified`, `rejected`, `proposed`, `won`, `lost`
- `fitScore`
- `whyRejected`
- `whyQualified`
- `clientUsername`

#### Conversation memory

- `conversationId`
- `accountId`
- `projectId`
- `lastInboundAt`
- `lastOutboundAt`
- `status`: `waiting_user`, `waiting_client`, `escalated`, `closed`
- `lastSummary`
- `nextSuggestedAction`

#### Client memory

- `username`
- `displayName`
- `score`
- `reviewsCount`
- `behaviorNotes`
- `openProjectsSeen`

### Shared memory format

This can live in:

- a database, preferred
- or a Markdown-backed notebook plus database index

If you want a quick operational layer, one good compromise is:

- database for structured state
- Markdown summaries for agent-readable context

Example:

- `memory/projects/<projectId>.md`
- `memory/conversations/<conversationId>.md`
- `memory/accounts/<accountId>.md`

The harness should generate/update those files. The MCP should not own them.

## Context Strategy

Agents should not literally share one giant context window.

That becomes expensive, noisy, and unstable.

Instead:

- keep canonical memory in storage
- generate compact summaries on demand
- inject only the relevant slices into each agent run

### Good pattern

- scout gets project shortlist memory
- qualifier gets project + client summary
- inbox agent gets conversation summary + last thread
- sender gets final draft + safety checks

This is much safer than a giant shared prompt.

## Notification and Chat Flow

This is where real productivity gains happen.

### Notification watcher loop

1. Poll inbox directories and account summary.
2. Detect new/unread or changed conversations.
3. Compare with memory.
4. If something changed, create a task.
5. Route the task to `inbox_operator`.

### Inbox reply flow

1. `notification_watcher` detects change.
2. Harness creates a `reply_needed` task.
3. `inbox_operator` loads:
   - conversation memory
   - last thread
   - related project memory
   - client memory
4. Agent drafts a response.
5. Harness applies rules:
   - auto-send
   - require approval
   - escalate
6. If approved, harness calls `inbox_sendMessage`.
7. Memory updates immediately after send.

This prevents duplicate replies and keeps accountability.

## Project Prospecting Flow

1. `scout` scans allowed categories.
2. Harness deduplicates against project memory.
3. New projects become candidate tasks.
4. `qualifier` scores them.
5. Good projects become proposal tasks.
6. `proposal_writer` drafts.
7. `proposal_sender` sends after approval or policy check.
8. Memory marks the project as `proposed`.

## Approval Model

The best design is not binary. Use approval tiers.

### Tier 1

Read-only actions:

- fully automatic

### Tier 2

Low-risk writes:

- draft generation
- memory updates

Usually automatic.

### Tier 3

Medium-risk writes:

- inbox replies
- profile edits

May require approval for new conversations or uncertain cases.

### Tier 4

High-risk writes:

- proposal sending
- repeated follow-up
- anything that can spend connections or annoy a client

Should start as approval-required.

## Account Selection Strategy

The harness should decide account selection using explicit rules, for example:

- niche match
- remaining connections
- subscription status
- account health
- previous relationship with the client
- current load

### Example strategies

- round-robin across healthy accounts
- niche-based routing
- premium accounts reserved for exclusive projects
- one account specialized for inbox only

## MVP Recommendation

To get to a working product fast, build this in layers.

### MVP 1

- one user
- one account
- scout + qualifier + inbox watcher
- manual approval for proposal sending
- manual approval for chat replies

### MVP 2

- multiple accounts
- stable account management
- auto-identification of username after cookie import
- shared memory store
- task queue

### MVP 3

- specialized agents
- auto-routing
- semi-auto proposal sending
- semi-auto inbox handling
- notification-based escalation

## Recommended Tables

If you use a real database in the harness, start with:

- `users`
- `workspaces`
- `accounts`
- `account_sessions`
- `agents`
- `agent_permissions`
- `projects`
- `project_candidates`
- `clients`
- `conversations`
- `messages`
- `notifications`
- `tasks`
- `drafts`
- `memory_snapshots`
- `audit_events`

## Recommended Task Types

- `scan_projects`
- `qualify_project`
- `draft_proposal`
- `send_proposal`
- `refresh_client_profile`
- `check_inbox`
- `draft_reply`
- `send_reply`
- `refresh_account_state`
- `optimize_profile`

## Failure Handling

The harness should assume failures happen.

### Examples

- cookies expire
- site HTML changes
- account loses subscription
- proposal minimum changes
- client replies with off-platform request
- duplicate event arrives twice

### Required behavior

- retry read operations with bounds
- do not blindly retry writes
- always update task state
- keep audit trail
- show clear human-readable reason

## What Not To Do

- do not let every agent call every tool
- do not keep all coordination inside one giant prompt
- do not use `username` as the only account key
- do not let MCP decide business policy
- do not store unstructured memory only in chat history

## Best First Implementation

If the objective is functional productivity fast, build this shape first:

1. account manager
2. cookie import flow with username auto-detection
3. project scanner
4. project memory and dedupe
5. inbox watcher
6. reply draft queue
7. approval inbox
8. proposal send flow

This already creates a strong productivity jump.

## Role of Markdown Memory

Markdown memory is useful, but it should be secondary.

Good use:

- human-readable summaries
- agent briefing docs
- account playbooks
- project rationale snapshots

Bad use:

- primary source of truth for task state
- dedupe source
- concurrency control

Use database first, Markdown second.

## Final Recommendation

The most productive architecture is:

- harness owns workflow, memory, permissions, queues, and approval
- MCP owns account-scoped execution
- agents are specialized
- shared memory is structured
- human approval is tiered

That is the shape most likely to create a real 10x or 100x productivity gain without turning into chaos.
