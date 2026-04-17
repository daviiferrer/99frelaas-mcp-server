# Workspace Memory

Use this reference before reading or writing files in `C:\Users\luisd\Documents\Projetos 99`.

The workspace is the local operating memory for opportunities, proposals, conversations, deals, wins, losses, and learning summaries.

## Directory Layout

Create this structure if missing:

```text
C:\Users\luisd\Documents\Projetos 99\
  accounts\
    <accountId>\
      memory.md
      opportunities.jsonl
      proposals.jsonl
      conversations.jsonl
      deals.jsonl
      tool-errors.jsonl
      daily\
        YYYY-MM-DD.md
  shared\
    playbook-summary.md
    templates.md
```

Default `accountId` is `main` unless the user gives another account.

## Privacy Rules

Never store:

- Cookies.
- Tokens.
- Passwords.
- Secret API keys.
- Raw payment credentials.
- Private client credentials.
- External contact details unless already part of an accepted project and needed for project context.

Store only operational facts needed for learning and follow-up.

## Stable Keys

Use stable keys:

```text
projectKey = "99f:<projectId>" when projectId exists
projectKey = "hash:<sha256(title|client|date)>" when no projectId exists
conversationKey = "99f-conv:<conversationId>"
proposalKey = "99f-proposal:<projectId>:<timestamp>"
```

If hashing is unavailable, use a readable fallback:

```text
hash:<normalized-title>-<YYYYMMDD>
```

## Status Values

Use these statuses for opportunities:

```text
discovered
screened
detailed
scored
drafted
pending_approval
sent
client_replied
negotiating
won
lost
archived
```

Use these outcome classes:

```text
sniper
consultive
high_risk
out_of_profile
do_not_bid
```

## opportunities.jsonl

Append or update a JSON line for every project worth tracking.

Schema:

```json
{
  "projectKey": "99f:123",
  "projectId": 123,
  "title": "",
  "clientName": "",
  "clientUsername": "",
  "category": "",
  "url": "",
  "status": "scored",
  "class": "sniper",
  "fitScore": 82,
  "riskScore": 20,
  "estimatedTicketMinCents": 15000,
  "estimatedTicketMaxCents": 50000,
  "reason": "",
  "nextAction": "draft_direct_proposal",
  "lastSeenAt": "2026-04-17T00:00:00-03:00",
  "createdAt": "2026-04-17T00:00:00-03:00",
  "updatedAt": "2026-04-17T00:00:00-03:00"
}
```

## proposals.jsonl

Record proposal drafts and sent proposals.

Schema:

```json
{
  "proposalKey": "99f-proposal:123:2026-04-17T00:00:00-03:00",
  "projectKey": "99f:123",
  "conversationKey": "",
  "mode": "direct_price",
  "text": "",
  "offerCents": 30000,
  "durationDays": 2,
  "status": "drafted",
  "approvedByUser": false,
  "sentAt": null,
  "createdAt": "2026-04-17T00:00:00-03:00"
}
```

Proposal statuses:

```text
drafted
pending_approval
sent
rejected_by_user
superseded
```

## conversations.jsonl

Record relevant inbox threads and turning points.

Schema:

```json
{
  "conversationKey": "99f-conv:123",
  "projectKey": "99f:123",
  "clientName": "",
  "projectTitle": "",
  "status": "client_replied",
  "lastMessageAt": "2026-04-17T00:00:00-03:00",
  "summary": "",
  "turningPoints": [
    {
      "type": "client_interest",
      "messageSummary": "",
      "at": "2026-04-17T00:00:00-03:00"
    }
  ],
  "nextAction": "",
  "updatedAt": "2026-04-17T00:00:00-03:00"
}
```

## deals.jsonl

Record wins and losses.

Schema:

```json
{
  "projectKey": "99f:123",
  "conversationKey": "99f-conv:123",
  "title": "",
  "clientName": "",
  "outcome": "won",
  "finalValueCents": 30000,
  "closedAt": "2026-04-17T00:00:00-03:00",
  "whyWonOrLost": "",
  "winningPattern": "",
  "failurePattern": "",
  "lessons": [],
  "createdAt": "2026-04-17T00:00:00-03:00"
}
```

Outcome values:

```text
won
lost
stalled
unknown
```

## memory.md

Keep this file short. It is the account summary injected into future prompts.

Suggested sections:

```md
# Account Memory: <accountId>

## Current Positioning

## Winning Patterns

## Losing Patterns

## Price Guidance

## Active Opportunities

## Open Conversations

## Last Updated
```

## daily/YYYY-MM-DD.md

Use daily notes for human-readable run logs:

```md
# Daily Log YYYY-MM-DD

## Scans

## Drafts

## Sent Proposals

## Client Replies

## Wins

## Losses

## Lessons
```

## Update Discipline

After every meaningful action:

1. Update the JSONL record.
2. Update `memory.md` only if the lesson changes future decisions.
3. Add a short daily note.
4. Keep status transitions explicit.

Do not rewrite history silently. If correcting a mistake, add a new line with updated status and reason.
