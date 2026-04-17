# Harness V2 Design

Este documento define uma versao menor, mais controlavel e evolutiva do harness para operar agentes sobre o MCP 99Freelas.

O objetivo do harness v2 e permitir que o usuario configure agentes por opcoes prontas, sem escrever prompts longos toda vez, mantendo controle sobre objetivo, estilo, tools, memoria, aprovacao e risco.

## Principio central

O usuario nao deve escrever prompts gigantes.

O usuario deve configurar comportamento.

O harness compila o prompt final a partir de:

- Papel do agente.
- Objetivo operacional.
- Perfil de comunicacao.
- Postura comercial.
- Permissoes de tools.
- Politica de execucao.
- Memoria resumida da conta.
- Tarefa atual.
- Brief curto opcional.

O MCP continua tool-only. Ele nao decide estrategia, nao cria agentes, nao controla fluxo e nao guarda regra comercial. O harness faz isso.

## Comecar pequeno

A primeira versao nao deve tentar ser uma fabrica completa de agentes autonomos.

MVP recomendado:

1. `ProjectScout`: encontra projetos candidatos.
2. `ProjectAnalyst`: analisa fit, risco e prioridade.
3. `ProposalWriter`: escreve rascunho de proposta ou pergunta diagnostica.

Fora do MVP inicial:

- Envio automatico de proposta.
- Resposta automatica na inbox.
- Agentes negociando sem aprovacao.
- Multi-contas complexas.
- Otimizacao automatica de estrategia.

Essas partes entram depois que o sistema provar que encontra bons projetos e escreve no padrao correto.

## Modelo de configuracao

```ts
type AgentConfig = {
  id: string;
  name: string;
  enabled: boolean;
  accountId: string;

  role: AgentRole;
  objective: ObjectiveConfig;
  behavior: BehaviorProfile;
  toolPolicy: ToolPolicy;
  runPolicy: RunPolicy;
  memoryPolicy: MemoryPolicy;

  customBrief?: string;
};
```

O `customBrief` deve ser curto. Ele ajusta a intencao do dia, mas nao substitui as configuracoes.

Exemplo:

```ts
customBrief: "Hoje priorizar automacoes pequenas de ate R$ 400 com entrega em ate 2 dias.";
```

## Papel do agente

```ts
enum AgentRole {
  PROJECT_SCOUT = "project_scout",
  PROJECT_ANALYST = "project_analyst",
  PROPOSAL_WRITER = "proposal_writer",
  INBOX_TRIAGER = "inbox_triager",
  CHAT_RESPONDER = "chat_responder",
  FOLLOW_UP_AGENT = "follow_up_agent",
  MEMORY_CURATOR = "memory_curator",
  COMPLIANCE_REVIEWER = "compliance_reviewer"
}
```

### Responsabilidades

`PROJECT_SCOUT`

Lista projetos, aplica filtros baratos e cria candidatos. Nao escreve proposta e nao abre detalhes de tudo.

`PROJECT_ANALYST`

Abre detalhes de candidatos, calcula fit, risco, classe e proxima acao.

`PROPOSAL_WRITER`

Gera rascunho de proposta ou pergunta diagnostica. Nao envia sozinho na v1.

`INBOX_TRIAGER`

Detecta conversas novas, respostas de clientes e mudancas de status.

`CHAT_RESPONDER`

Gera resposta contextual para cliente. Na v1, deve exigir aprovacao.

`FOLLOW_UP_AGENT`

Sugere follow-up leve quando houver contexto. Deve ter limite rigido para evitar excesso de mensagens.

`MEMORY_CURATOR`

Resume aprendizados da conta, projetos ganhos, perdas e padroes.

`COMPLIANCE_REVIEWER`

Revisa proposta/resposta antes de envio, com foco em regras da plataforma e risco de ban.

## Objetivo operacional

O objetivo nao deve ser apenas texto livre. O ideal e usar presets com parametros.

```ts
enum ObjectivePreset {
  FIND_SNIPER_PROJECTS = "find_sniper_projects",
  FIND_CONSULTIVE_PROJECTS = "find_consultive_projects",
  SCORE_PROJECT_FIT = "score_project_fit",
  DRAFT_DIRECT_PROPOSAL = "draft_direct_proposal",
  DRAFT_DIAGNOSTIC_QUESTION = "draft_diagnostic_question",
  RESPOND_CLIENT_WITH_CONTEXT = "respond_client_with_context",
  FOLLOW_UP_WARM_LEAD = "follow_up_warm_lead",
  SUMMARIZE_ACCOUNT_LEARNINGS = "summarize_account_learnings"
}

type ObjectiveConfig = {
  preset: ObjectivePreset;
  successCriteria?: {
    minFitScore?: number;
    maxEstimatedTicket?: number;
    minEstimatedTicket?: number;
    preferredDeliveryDays?: number;
    requireConcretePain?: boolean;
    requireTechnicalFit?: boolean;
    allowHighRiskProjects?: boolean;
  };
};
```

### Presets iniciais

`FIND_SNIPER_PROJECTS`

Busca projetos pequenos, tecnicos, concretos e de resolucao rapida.

Default recomendado:

```ts
{
  minFitScore: 75,
  maxEstimatedTicket: 500,
  preferredDeliveryDays: 2,
  requireConcretePain: true,
  requireTechnicalFit: true,
  allowHighRiskProjects: false
}
```

`FIND_CONSULTIVE_PROJECTS`

Busca projetos maiores, mas que precisam de diagnostico antes de proposta.

Default recomendado:

```ts
{
  minFitScore: 70,
  minEstimatedTicket: 500,
  requireConcretePain: true,
  requireTechnicalFit: true,
  allowHighRiskProjects: true
}
```

`SCORE_PROJECT_FIT`

Analisa um projeto e devolve classificacao estruturada.

`DRAFT_DIRECT_PROPOSAL`

Gera proposta curta com preco, prazo, escopo e proximo passo.

`DRAFT_DIAGNOSTIC_QUESTION`

Gera pergunta curta quando uma resposta muda preco, prazo ou arquitetura.

`RESPOND_CLIENT_WITH_CONTEXT`

Responde cliente usando historico da thread e estado do projeto.

`FOLLOW_UP_WARM_LEAD`

Sugere uma mensagem leve quando houve interesse real e silencio.

`SUMMARIZE_ACCOUNT_LEARNINGS`

Atualiza memoria resumida com aprendizados de sucesso e falha.

## Perfil de comportamento

O comportamento deve ser composto por eixos pequenos. Isso evita criar centenas de combinacoes rigidas.

```ts
enum SalesPosture {
  DAVI_SNIPER = "davi_sniper",
  TECH_AUDITOR = "tech_auditor",
  CONSULTIVE_PARTNER = "consultive_partner",
  SENIOR_ARCHITECT = "senior_architect",
  LOW_FRICTION_HELPER = "low_friction_helper"
}

enum Tone {
  INFORMAL = "informal",
  NEUTRAL = "neutral",
  FORMAL = "formal"
}

enum Verbosity {
  SHORT = "short",
  BALANCED = "balanced",
  DETAILED = "detailed"
}

enum Assertiveness {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high"
}

enum ProposalMode {
  DIRECT_PRICE = "direct_price",
  DIAGNOSTIC_FIRST = "diagnostic_first",
  TWO_STAGE_SCOPE = "two_stage_scope",
  NO_BID = "no_bid"
}

type BehaviorProfile = {
  salesPosture: SalesPosture;
  tone: Tone;
  verbosity: Verbosity;
  assertiveness: Assertiveness;
  proposalMode: ProposalMode;
};
```

### Posturas comerciais

`DAVI_SNIPER`

Padrao vencedor da conta. Direto, simples, tecnico e rapido.

Usar quando:

- Projeto pequeno ou medio.
- Dor concreta.
- Entrega rapida.
- Tecnologia familiar.

Evitar quando:

- Ticket alto.
- Cliente muito tecnico.
- Escopo juridico, captcha, certificado ou risco alto.

`TECH_AUDITOR`

Mais cauteloso e diagnostico. Bom para codigo, deploy, integracao e risco tecnico.

Usar quando:

- Ha repositorio, ambiente ou sistema quebrado.
- O cliente precisa confiar antes de fechar.
- O risco tecnico precisa ser explicado.

`CONSULTIVE_PARTNER`

Parceiro de solucao. Bom para MVP, automacao de processo e cliente que ainda esta desenhando o fluxo.

Usar quando:

- Projeto tem potencial, mas falta escopo.
- Uma pergunta muda arquitetura ou preco.
- O cliente precisa de orientacao sem ser sobrecarregado.

`SENIOR_ARCHITECT`

Mais formal e estruturado. Usar com cuidado.

Usar quando:

- Ticket alto.
- Projeto exige arquitetura real.
- Cliente parece tecnico e maduro.

Evitar em projetos pequenos. Pode soar caro ou pesado.

`LOW_FRICTION_HELPER`

Muito simples e facilitador. Bom para clientes pouco tecnicos.

Usar quando:

- Cliente quer resolver algo pratico.
- Briefing e simples.
- O maior risco e o cliente sentir que da trabalho contratar.

## Configuracoes vencedoras iniciais

### Sniper padrao

```ts
{
  salesPosture: "davi_sniper",
  tone: "informal",
  verbosity: "short",
  assertiveness: "medium",
  proposalMode: "direct_price"
}
```

### Analista tecnico

```ts
{
  salesPosture: "tech_auditor",
  tone: "neutral",
  verbosity: "balanced",
  assertiveness: "low",
  proposalMode: "diagnostic_first"
}
```

### Consultivo enxuto

```ts
{
  salesPosture: "consultive_partner",
  tone: "neutral",
  verbosity: "balanced",
  assertiveness: "medium",
  proposalMode: "two_stage_scope"
}
```

## Politica de tools

As tools devem ser concedidas por perfil, nao individualmente em prompt livre.

```ts
enum ToolPermissionProfile {
  READ_ONLY = "read_only",
  PROJECT_RESEARCH = "project_research",
  PROJECT_ANALYSIS = "project_analysis",
  PROPOSAL_DRAFTING = "proposal_drafting",
  PROPOSAL_SENDING_WITH_APPROVAL = "proposal_sending_with_approval",
  INBOX_READ_ONLY = "inbox_read_only",
  INBOX_REPLY_WITH_APPROVAL = "inbox_reply_with_approval",
  ACCOUNT_ADMIN = "account_admin"
}

type ToolPolicy = {
  profile: ToolPermissionProfile;
  allowedTools: string[];
  blockedTools?: string[];
  requireApprovalFor?: string[];
};
```

### Perfis recomendados

`PROJECT_RESEARCH`

Tools:

- `projects_listCategories`
- `projects_list`
- `projects_listByAvailability`

`PROJECT_ANALYSIS`

Tools:

- `projects_get`
- `projects_getBidContext`
- `profiles_get`
- `account_getConnections`

`PROPOSAL_DRAFTING`

Tools de leitura apenas. A proposta e gerada pelo modelo, mas nao enviada.

`PROPOSAL_SENDING_WITH_APPROVAL`

Inclui `proposals_send`, sempre com aprovacao na v1.

`INBOX_READ_ONLY`

Tools:

- `inbox_listConversations`
- `inbox_getThread`
- `inbox_getMessages`
- `notifications_list`

`INBOX_REPLY_WITH_APPROVAL`

Inclui `inbox_sendMessage`, sempre com aprovacao na v1.

`ACCOUNT_ADMIN`

Tools sensiveis:

- `auth_importCookies`
- `auth_clearSession`
- `auth_listSessions`
- `profile_update`

Na v1, esse perfil deve ser usado apenas manualmente.

## Politica de execucao

```ts
type RunPolicy = {
  maxToolCallsPerRun: number;
  maxModelCallsPerRun: number;
  requireHumanApproval: boolean;
  dryRunByDefault: boolean;
  stopOnToolError: boolean;
  maxFollowUpsPerConversation: number;
};
```

Defaults seguros:

```ts
{
  maxToolCallsPerRun: 8,
  maxModelCallsPerRun: 2,
  requireHumanApproval: true,
  dryRunByDefault: true,
  stopOnToolError: true,
  maxFollowUpsPerConversation: 1
}
```

## Politica de memoria

```ts
enum MemoryScope {
  NONE = "none",
  ACCOUNT_SUMMARY = "account_summary",
  PROJECT_MEMORY = "project_memory",
  CONVERSATION_MEMORY = "conversation_memory"
}

type MemoryPolicy = {
  scopes: MemoryScope[];
  injectConversionPlaybook: boolean;
  maxMemoryTokens: number;
};
```

Recomendacao inicial:

```ts
{
  scopes: ["account_summary", "project_memory"],
  injectConversionPlaybook: true,
  maxMemoryTokens: 350
}
```

O playbook completo nao deve ser injetado sempre. O harness deve injetar um resumo curto.

Resumo base:

```text
Perfil vencedor da conta: dev executor consultivo, rapido e especifico. Priorize automacao, API, VPS, n8n, WhatsApp, CRM, scripts e deploy. Favoreca dor concreta, prova ou diagnostico, preco assimilavel e prazo curto. Evite pitch abstrato, jargao pesado, follow-up excessivo e promessa no-code para problema hard-code.
```

## Maquina de estados simples

O harness deve controlar fluxo por estado, nao por prompt livre.

```ts
enum OpportunityStatus {
  DISCOVERED = "discovered",
  SCREENED = "screened",
  DETAILED = "detailed",
  SCORED = "scored",
  DRAFTED = "drafted",
  PENDING_APPROVAL = "pending_approval",
  SENT = "sent",
  CLIENT_REPLIED = "client_replied",
  NEGOTIATING = "negotiating",
  WON = "won",
  LOST = "lost",
  ARCHIVED = "archived"
}
```

### Fluxo v1

1. `ProjectScout` cria `DISCOVERED`.
2. Filtro barato move para `SCREENED`.
3. `ProjectAnalyst` abre detalhes e move para `SCORED`.
4. Se `fitScore >= threshold`, cria tarefa para `ProposalWriter`.
5. `ProposalWriter` gera rascunho e move para `PENDING_APPROVAL`.
6. Usuario aprova ou edita.
7. Futuramente, `ProposalSender` envia.

## Classificacao de oportunidade

```ts
enum OpportunityClass {
  SNIPER = "sniper",
  CONSULTIVE = "consultive",
  HIGH_RISK = "high_risk",
  OUT_OF_PROFILE = "out_of_profile",
  DO_NOT_BID = "do_not_bid"
}
```

### Regras de classificacao

`SNIPER`

- Dor clara.
- Fit tecnico alto.
- Escopo pequeno.
- Entrega rapida.
- Baixo risco.

`CONSULTIVE`

- Bom potencial.
- Escopo ainda incompleto.
- Uma a tres perguntas mudam preco, prazo ou arquitetura.

`HIGH_RISK`

- Captcha, certificado, tribunal, bloqueio, seguranca, dados sensiveis ou arquitetura incerta.

`OUT_OF_PROFILE`

- Projeto distante do foco vencedor da conta.

`DO_NOT_BID`

- Baixo fit, risco de regra da plataforma, teste gratis, contato externo prematuro ou cliente com sinais ruins.

## Saida estruturada dos agentes

Agentes devem devolver JSON estruturado. Texto livre vem apenas como campo.

### ProjectAnalyst output

```ts
type ProjectAnalysisOutput = {
  projectId: number;
  class: OpportunityClass;
  fitScore: number;
  riskScore: number;
  expectedTicketRange?: {
    min: number;
    max: number;
  };
  reasoning: string;
  missingInfo: string[];
  recommendedNextAction:
    | "draft_direct_proposal"
    | "draft_diagnostic_question"
    | "skip"
    | "needs_human_review";
};
```

### ProposalWriter output

```ts
type ProposalDraftOutput = {
  mode: ProposalMode;
  proposalText: string;
  suggestedOfferCents?: number;
  suggestedDurationDays?: number;
  assumptions: string[];
  risks: string[];
  approvalRequired: boolean;
};
```

## Prompt compiler

O prompt final deve ser montado por fragmentos pequenos.

```ts
type PromptFragment = {
  key: string;
  tokenBudget: number;
  content: string;
};
```

Ordem recomendada:

1. Base safety and platform rules.
2. Role fragment.
3. Objective fragment.
4. Behavior fragment.
5. Tool policy fragment.
6. Memory summary.
7. Current task payload.
8. Output schema.

Orcamento recomendado por chamada:

- Base: 250 tokens.
- Role: 80 tokens.
- Objective: 120 tokens.
- Behavior: 120 tokens.
- Tool policy: 100 tokens.
- Memory: 250 a 350 tokens.
- Task payload: variavel.
- Output schema: 150 tokens.

Meta: manter chamadas comuns abaixo de 1.500 tokens de prompt, sem contar dados retornados pelas tools.

## Fragmentos de prompt iniciais

### Base

```text
Voce opera uma conta do 99Freelas por meio de tools MCP. Use apenas dados confirmados por tools. Nao invente historico, valores, status ou mensagens. Mantenha negociacao, pagamento e combinados dentro da plataforma. Priorize seguranca, clareza e baixo risco.
```

### Davi Sniper

```text
Estilo comercial: dev executor consultivo. Seja direto, simples e tecnico. Reduza incerteza rapido. Prefira diagnostico curto, prova concreta, preco assimilavel, prazo curto e proximo passo claro. Evite pitch abstrato, jargao pesado e excesso de mensagens.
```

### Tech Auditor

```text
Estilo comercial: auditor tecnico. Antes de prometer, valide repositorio, ambiente, API, acesso ou risco. Explique bloqueios com linguagem simples. Transparencia tecnica aumenta confianca; nao tente fechar escondendo incerteza.
```

### Consultive Partner

```text
Estilo comercial: parceiro consultivo enxuto. Ajude o cliente a organizar a decisao com poucas perguntas. Pergunte apenas o que muda preco, prazo ou arquitetura. Sugira caminho simples antes de escopo grande.
```

## Guardrails

Guardrails devem existir no harness, nao no MCP.

Bloquear ou exigir aprovacao quando:

- Tool vai enviar proposta.
- Tool vai enviar mensagem.
- Mensagem contem contato externo antes de contrato.
- Mensagem menciona burlar regras da plataforma.
- Projeto parece teste gratis.
- Projeto exige captcha, certificado, tribunal ou dados sensiveis.
- Follow-up passaria do limite configurado.

## Produto minimo de tela

Para comecar, a UI pode ter somente:

- Lista de agentes.
- Formulario de `AgentConfig`.
- Lista de oportunidades.
- Score e classe de cada oportunidade.
- Rascunho de proposta.
- Botao aprovar/rejeitar.
- Historico de execucoes.

Campos editaveis do agente:

- Nome.
- Conta.
- Papel.
- Objetivo.
- Postura comercial.
- Tom.
- Tamanho da resposta.
- Assertividade.
- Modo de proposta.
- Perfil de tools.
- Limite de chamadas.
- Brief curto.

## Evolucao por fases

### Fase 1

- Configurar agentes.
- Rodar scout manual.
- Gerar analises e drafts.
- Tudo com aprovacao humana.

### Fase 2

- Scheduler simples.
- Inbox triage.
- Notificacoes.
- Memoria resumida por conta.

### Fase 3

- Envio de proposta com aprovacao.
- Resposta de inbox com aprovacao.
- A/B test de postura e tom.

### Fase 4

- Otimizacao por performance.
- Recomendacao automatica de config.
- Multi-contas com politicas separadas.
- Relatorios de conversao por enum.

## Metricas

Guardar por execucao:

- `agentId`
- `accountId`
- `role`
- `objectivePreset`
- `behaviorProfile`
- `projectId`
- `opportunityClass`
- `fitScore`
- `riskScore`
- `draftCreated`
- `approved`
- `sent`
- `clientReplied`
- `won`
- `lost`
- `tokenUsage`
- `toolCallCount`

Com isso o usuario pode responder perguntas como:

- Qual postura converte mais?
- Tom informal performa melhor que neutro?
- Proposta direta ganha mais que pergunta diagnostica?
- Projetos `sniper` realmente fecham mais?
- Onde o agente esta gastando token demais?

## Decisao de arquitetura

O harness v2 deve ser orientado por configuracao e estado.

Evitar:

- Prompt gigante por agente.
- Estrategia hardcoded no MCP.
- Agente com todas as tools.
- Fluxo totalmente autonomo na v1.
- Envio automatico sem aprovacao.

Preferir:

- Enums pequenos e combinaveis.
- Presets editaveis.
- Prompt compiler.
- Outputs estruturados.
- Estado explicito.
- Tool policies.
- Guardrails no harness.
- Medicao por configuracao.

## Conclusao

O caminho mais seguro e produtivo e construir um harness que comece pequeno, mas ja tenha a estrutura certa para crescer.

Na v1, o sistema precisa provar tres coisas:

1. Encontra projetos melhores do que uma busca manual comum.
2. Classifica oportunidades de acordo com o padrao real da conta.
3. Escreve rascunhos no estilo que historicamente converteu.

Depois disso, vale automatizar envio, inbox e multi-contas com mais confianca.
