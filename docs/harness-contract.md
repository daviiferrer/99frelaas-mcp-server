# Harness Contract

This MCP server is the execution layer. The harness is responsible for orchestration.

## Required Context

Every authenticated call should carry:

- `accountId`
- `agentId` when the harness wants correlation or audit tracing

## Agent Metadata

`agentId` is request metadata for the harness. The MCP does not enforce agent roles, ownership, budgets, or negotiation rules.

The harness may use any naming scheme, for example:

- `scout:*`
- `proposal:*`
- `inbox:*`
- `profile:*`
- `orchestrator:*`

## Session Model

- The harness owns account selection and policy.
- The MCP resolves authenticated cookies by `accountId`.
- Sessions are isolated by account namespace.
- The MCP may persist encrypted cookies per account, but it should not infer business policy from them.

## Policy Controls

Keep these settings in the harness, not inside MCP runtime logic:

- rate limits
- budgets
- retry policy
- approval policy
- agent role ownership
- queueing and scheduling

## Operating Rules

1. The harness chooses the agent role.
2. The harness chooses the account and session to use.
3. The MCP validates input, resolves the account-scoped session, and executes the tool.
4. The harness handles retries, queues, approvals, budgets, and agent coordination.

## Non-Hardcoded Principle

Do not embed account names, agent names, or policy defaults in workflow code. Resolve them from harness config at runtime.
