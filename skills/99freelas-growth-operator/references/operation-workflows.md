# Operation Workflows

Use this reference before running prospecting, project analysis, proposal, inbox, or follow-up tasks.

## Workflow: Prospect For Opportunities

Goal: find projects that match Davi's winning pattern.

Steps:

1. Check active account context.
2. Load current account memory from `memory.md` if available.
3. Use MCP project listing tools.
4. Apply cheap filters before opening details.
5. Prioritize `sniper` candidates.
6. Open details only for shortlisted projects.
7. Score each project.
8. Save/update `opportunities.jsonl`.
9. Draft only for high-fit projects.

Cheap filters:

- Title has concrete technical pain.
- Category matches automation, software, API, VPS, CRM, WhatsApp, Python, n8n, WordPress, deploy, scraping, or integrations.
- Briefing describes a real workflow or broken system.
- Project can likely be delivered in hours or a few days.
- No obvious platform-rule risk.

Reject early:

- Vague "complete platform" with low budget.
- Generic marketing/copy/design unless user requested it.
- Requests for free tests.
- Premature off-platform contact.
- Heavy captcha/certificate/court automation without budget and validation.

## Workflow: Score Project

Return structured analysis.

Fit score guide:

- `90-100`: exact match, concrete pain, low risk, fast delivery.
- `75-89`: strong match, maybe one missing detail.
- `60-74`: possible, needs diagnostic question.
- `40-59`: weak fit or unclear.
- `<40`: skip.

Risk score guide:

- `0-25`: low risk, common workflow.
- `26-50`: some unknowns.
- `51-75`: significant technical or client risk.
- `76-100`: avoid unless user explicitly wants risky projects.

Scoring dimensions:

- Technical fit.
- Clarity of pain.
- Delivery speed.
- Price fit.
- Client seriousness.
- Rule/compliance risk.
- Need for proof or diagnosis.

## Workflow: Draft Proposal

Use `conversion-style.md`.

For `sniper`:

1. Open with "consigo resolver" or direct understanding.
2. Diagnose the bottleneck in one sentence.
3. Explain simple execution path.
4. Give value and deadline if enough information exists.
5. Ask for one concrete next step.

For `consultive`:

1. State understanding.
2. Ask 1-3 questions that change price, deadline, or architecture.
3. Optionally give a range or two-stage path.
4. Avoid asking the client to prepare a full document.

For `high_risk`:

1. Be transparent about validation.
2. Do not promise final delivery.
3. Suggest feasibility check or staged scope.

Always save draft in `proposals.jsonl`.

## Workflow: Send Proposal

Only send when:

- User explicitly requested sending, or approval policy allows it.
- `projects_getBidContext` confirms user can bid.
- Offer is at or above minimum.
- Project is not already proposed.
- Proposal text avoids rule violations.

Before sending:

1. Summarize project, offer, duration, and text.
2. Ask/confirm approval if required.
3. Use dry run if uncertain.
4. After sending, update `proposals.jsonl` and `opportunities.jsonl`.

## Workflow: Inbox Triage

Goal: detect client replies and update status.

Steps:

1. Use MCP inbox listing with pagination when available.
2. Open threads with unread/recent/client-replied signals.
3. Summarize thread.
4. Classify status:
   - `client_replied`
   - `negotiating`
   - `won`
   - `lost`
   - `stalled`
5. Update `conversations.jsonl`.
6. If payment released or project finalized, update `deals.jsonl`.

Signals of interest:

- Client asks price.
- Client asks if you can do it.
- Client asks for proof/print.
- Client sends access/repo/file.
- Client selects proposal.
- Payment guaranteed.
- Payment released.

Signals of risk:

- Client asks to go off-platform before acceptance.
- Client asks for free test.
- Client questions architecture and there is uncertainty.
- Client asks heavy technical blockers not validated yet.
- Client goes silent after price.

## Workflow: Reply To Client

Before replying:

1. Read full thread.
2. Identify current stage.
3. Identify what the client needs to decide next.
4. Keep reply short.
5. Use one clear next step.

Reply patterns:

- Price question: give value or range, then one next step.
- Scope unclear: ask one decisive question.
- Technical doubt: answer honestly and offer validation.
- Access needed: list only necessary accesses.
- Client silent: one light follow-up max.

Avoid:

- Several messages in a row.
- Forcing call.
- Overexplaining architecture.
- Asking for a document when one easy question would work.

## Workflow: Mark Win/Loss

Mark `won` when:

- Client selected proposal.
- Payment was guaranteed.
- Project completed.
- Payment was released.

Mark `lost` when:

- Client explicitly rejects.
- Client chooses another freelancer.
- Client says lost interest.
- Thread is stale and no next action remains.

For every win/loss, record:

- Why it happened.
- Which pattern appeared.
- What to repeat or avoid.
- Final value if known.
- Close/loss date if known.

## Workflow: Learning Summary

Run periodically or after several outcomes.

Steps:

1. Read recent `deals.jsonl`.
2. Compare wins vs losses.
3. Update `memory.md` with only durable lessons.
4. Keep memory short enough for future prompt injection.

Durable lesson examples:

- "Direct price works for deploy/VPS under R$ 400."
- "Avoid pushing call immediately after client asks price."
- "For court/captcha projects, require feasibility validation before proposal."
