# Conversion Style

Use this reference before writing proposals, diagnostic questions, follow-ups, or inbox replies.

## Winning Pattern

Davi wins when he behaves like a fast technical executor:

- Diagnose the real bottleneck quickly.
- Speak simply.
- Show proof, a similar case, or a concrete technical observation.
- Offer a clear small/medium price when the scope is clear.
- Offer short delivery.
- Give the client an easy next step.

Winning formula:

```text
I understood the problem -> here is the likely bottleneck -> here is the simple fix -> I can deliver by X -> value is Y -> send/confirm Z and I start.
```

## Best Fit Projects

Prioritize:

- n8n automations.
- API integrations.
- VPS deploy.
- Domain/server setup.
- Python scripts.
- WhatsApp/CRM/Kommo flows.
- Form -> payment -> PDF -> delivery flows.
- Small MVPs with concrete scope.
- Existing systems that need fixing, publishing, or adapting.

Avoid or pause:

- Large vague platforms.
- Low-budget "complete SaaS" projects.
- Captcha/certificate/court automation without validation.
- Clients asking for free tests.
- Projects requiring off-platform negotiation.
- Projects where no concrete pain is visible.

## What Worked In Won Deals

### Court movement robot

What worked:

- Said a similar robot already existed.
- Gave direct price.
- Promised same-day configuration.
- Sent visual proof.
- Confirmed adaptation to the client's spreadsheet.
- Asked directly if they wanted to move forward.

Repeat:

```text
I already have something close to this. I can adapt it to your operation and leave it running/tested.
```

### Base44 VPS deploy

What worked:

- Opened with exact result.
- Promised same-day deploy.
- Explained a practical benefit: easier future updates.
- Mentioned profile history.
- Negotiated simply.

Repeat:

```text
I can publish this on your VPS today and leave a simple update path for the code.
```

### Python/VPS project

What worked:

- Asked to inspect the repo before promising.
- Explained honestly that the first repo was incomplete.
- Converted by being transparent.

Repeat:

```text
Before promising the deploy, I need to validate the repo. If something is missing, I will tell you exactly what blocks production.
```

### n8n payment/PDF/WhatsApp MVP

What worked:

- Translated the flow clearly.
- Asked if it was internal use or SaaS.
- Explained why that changed database/security.
- Suggested a cheaper WhatsApp path.
- Gave price and deadline after diagnosis.

Repeat:

```text
The flow is: form -> payment -> PDF -> delivery. One point changes the architecture: is this for internal use or a SaaS MVP?
```

## What Failed

### Over-follow-up

After giving a price, do not send many messages pushing a meeting. Let the client process.

Bad pattern:

```text
price -> call request -> second call request -> time slots -> more pressure
```

Better:

```text
For this scope, it starts at R$ X. If that range makes sense, I can check your setup and close the exact scope.
```

### Over-engineering

Avoid starting with OAuth, payload normalization, workflow engine, dashboards, orchestration, or AI platform language unless the client asked for architecture.

Better:

```text
The main job is to receive events from the platforms, normalize the fields, and save them reliably in WordPress. I can first map one platform and then replicate the pattern.
```

### No-code mismatch

Do not sell a no-code/visual tool as robust hard-code for technical clients. If the problem involves captcha, certificates, court portals, or strong anti-bot barriers, be transparent.

Better:

```text
This cannot be promised as a simple visual automation before testing the access/captcha/certificate flow. I would validate feasibility first and only then price the full build.
```

### Asking too much from cold clients

Do not ask a cold client to prepare documents or full scope. Ask one easy question.

Better:

```text
Today the bot only needs to send the catalog, or also qualify the lead before passing to a human?
```

## Template: Sniper Proposal

```text
Opa, [nome]. Consigo resolver isso.

Pelo que entendi, o ponto principal e [diagnostico simples]. Eu faria [solucao curta] e deixaria testado em [prazo].

Para esse escopo, consigo fazer por R$ [valor]. Se fizer sentido, me envia [acesso/repositorio/arquivo] e ja comeco.
```

## Template: Diagnostic Question

```text
Opa, [nome]. Consigo te ajudar, mas tem um ponto que muda bastante prazo e valor: [variavel].

Se for apenas [escopo simples], fica mais rapido e barato. Se incluir [escopo maior], eu separaria em uma segunda etapa.

Hoje sua prioridade e resolver o fluxo basico funcionando ou ja deixar pronto para escalar?
```

## Template: Technical Audit

```text
Opa, [nome]. Consigo olhar isso.

Antes de prometer o deploy/automacao, preciso validar rapidamente [repo/acesso/API/ambiente] para confirmar se ja esta pronto para producao ou se falta ajuste.

Se estiver tudo certo, consigo entregar em [prazo]. Se encontrar bloqueio, te explico exatamente o que precisa corrigir.
```

## Tone Rules

- Use "opa" or "fala" only when informal tone fits.
- Prefer short paragraphs.
- Avoid sounding like an agency.
- Avoid long capability lists.
- Use concrete nouns: repo, VPS, n8n, Kommo, planilha, PDF, checkout, webhook.
- In higher tickets, replace confidence hype with scope clarity.
