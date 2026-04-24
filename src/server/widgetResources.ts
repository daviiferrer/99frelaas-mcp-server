import type { Resource } from "@modelcontextprotocol/sdk/types.js";

const PROJECTS_WIDGET_URI = "ui://99freelas/projects.html";
const PROJECT_DETAIL_WIDGET_URI = "ui://99freelas/project-detail.html";
const PROPOSAL_WIDGET_URI = "ui://99freelas/proposal.html";
const INBOX_WIDGET_URI = "ui://99freelas/inbox.html";
const ACCOUNT_WIDGET_URI = "ui://99freelas/account.html";

const WIDGET_URIS = [
  PROJECTS_WIDGET_URI,
  PROJECT_DETAIL_WIDGET_URI,
  PROPOSAL_WIDGET_URI,
  INBOX_WIDGET_URI,
  ACCOUNT_WIDGET_URI,
] as const;

type WidgetUri = (typeof WIDGET_URIS)[number];

type WidgetDefinition = {
  uri: WidgetUri;
  name: string;
  title: string;
  description: string;
  variant: "projects" | "project-detail" | "proposal" | "inbox" | "account";
};

export const toolWidgetResourceUri: Record<string, WidgetUri | undefined> = {
  projects_list: PROJECTS_WIDGET_URI,
  projects_listByAvailability: PROJECTS_WIDGET_URI,
  projects_get: PROJECT_DETAIL_WIDGET_URI,
  projects_getBidContext: PROPOSAL_WIDGET_URI,
  proposals_send: PROPOSAL_WIDGET_URI,
  inbox_listConversations: INBOX_WIDGET_URI,
  inbox_getMessages: INBOX_WIDGET_URI,
  inbox_getThread: INBOX_WIDGET_URI,
  inbox_getDirectoryCounts: INBOX_WIDGET_URI,
  notifications_list: INBOX_WIDGET_URI,
  inbox_sendMessage: INBOX_WIDGET_URI,
  account_getConnections: ACCOUNT_WIDGET_URI,
  account_getDashboardSummary: ACCOUNT_WIDGET_URI,
  account_getSubscriptionStatus: ACCOUNT_WIDGET_URI,
  auth_checkSession: ACCOUNT_WIDGET_URI,
  system_health: ACCOUNT_WIDGET_URI,
};

const widgetDefinitions: WidgetDefinition[] = [
  {
    uri: PROJECTS_WIDGET_URI,
    name: "projects-widget",
    title: "Projetos 99Freelas",
    description: "Inline list for scanning 99Freelas project opportunities.",
    variant: "projects",
  },
  {
    uri: PROJECT_DETAIL_WIDGET_URI,
    name: "project-detail-widget",
    title: "Detalhe do projeto",
    description: "Inline project summary with client signals, scope, skills, and bid readiness.",
    variant: "project-detail",
  },
  {
    uri: PROPOSAL_WIDGET_URI,
    name: "proposal-widget",
    title: "Proposta 99Freelas",
    description: "Proposal preparation and send result frame for 99Freelas.",
    variant: "proposal",
  },
  {
    uri: INBOX_WIDGET_URI,
    name: "inbox-widget",
    title: "Inbox 99Freelas",
    description: "Conversation and notification frame for 99Freelas inbox workflows.",
    variant: "inbox",
  },
  {
    uri: ACCOUNT_WIDGET_URI,
    name: "account-widget",
    title: "Conta 99Freelas",
    description: "Compact account, connection, subscription, and session status frame.",
    variant: "account",
  },
];

const escapeScriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

const sharedWidgetHtml = (definition: WidgetDefinition): string => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${definition.title}</title>
  <style>
    :root {
      color-scheme: light;
      --color-text: #333333;
      --color-muted: #6f7377;
      --color-border: #dad7d7;
      --color-surface: #ffffff;
      --color-soft: #f7f8fa;
      --color-green: #48a65b;
      --color-blue: #00adef;
      --color-red: #db524d;
      --radius: 6px;
      --gap: 10px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--color-text);
      background: var(--color-surface);
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .frame {
      display: grid;
      gap: 12px;
      padding: 14px;
      max-width: 760px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gap);
      padding-bottom: 10px;
      border-bottom: 1px solid var(--color-border);
    }
    .title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .subtitle {
      margin-top: 2px;
      color: var(--color-muted);
      font-size: 12px;
    }
    .list {
      display: grid;
      gap: 10px;
    }
    .item {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gap);
    }
    .item-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.3;
    }
    .meta, .text, .empty {
      color: var(--color-muted);
      font-size: 12px;
    }
    .text {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 8px;
      border: 1px solid var(--color-border);
      border-radius: 999px;
      color: var(--color-muted);
      background: var(--color-soft);
      font-size: 11px;
      white-space: nowrap;
    }
    .chip.green {
      border-color: rgba(72, 166, 91, 0.35);
      color: #2f7d42;
      background: rgba(72, 166, 91, 0.09);
    }
    .chip.blue {
      border-color: rgba(0, 173, 239, 0.35);
      color: #087ba9;
      background: rgba(0, 173, 239, 0.08);
    }
    .chip.red {
      border-color: rgba(219, 82, 77, 0.35);
      color: #a33a36;
      background: rgba(219, 82, 77, 0.08);
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 8px;
    }
    .metric {
      padding: 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-soft);
    }
    .metric-value {
      font-size: 15px;
      font-weight: 700;
    }
    .metric-label {
      color: var(--color-muted);
      font-size: 11px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 2px;
    }
    button {
      min-height: 34px;
      padding: 7px 12px;
      border: 0;
      border-radius: 3px;
      color: #ffffff;
      background: var(--color-green);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: var(--color-blue);
    }
    button:disabled {
      cursor: default;
      opacity: 0.55;
    }
    .notice {
      padding: 10px;
      border: 1px solid rgba(219, 82, 77, 0.25);
      border-radius: var(--radius);
      color: #7f302d;
      background: rgba(219, 82, 77, 0.06);
      font-size: 12px;
    }
    .message {
      padding: 10px;
      border-radius: var(--radius);
      background: var(--color-soft);
      color: var(--color-text);
      font-size: 12px;
    }
    @media (max-width: 520px) {
      .frame { padding: 12px; }
      .row { align-items: flex-start; flex-direction: column; }
      .actions { display: grid; grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="frame" id="app" aria-live="polite"></main>
  <script>
    const WIDGET = ${escapeScriptJson({ title: definition.title, variant: definition.variant })};
    let latestToolResult = null;
    let latestToolInput = null;
    let requestId = 1;

    const app = document.getElementById("app");
    const money = (cents) => {
      if (!Number.isFinite(Number(cents))) return undefined;
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
    };
    const render = (template) => {
      app.innerHTML = template;
    };
    const chips = (items) => {
      const visible = (items || []).filter(Boolean).slice(0, 8);
      if (!visible.length) return "";
      return '<div class="chips">' + visible.map((item) => '<span class="chip">' + escapeHtml(item) + '</span>').join("") + '</div>';
    };
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
    const readPayload = () => latestToolResult?.structuredContent || latestToolResult || {};
    const metric = (label, value) => value === undefined || value === null || value === ""
      ? ""
      : '<div class="metric"><div class="metric-value">' + escapeHtml(value) + '</div><div class="metric-label">' + escapeHtml(label) + '</div></div>';
    const postRpc = (method, params) => {
      window.parent?.postMessage({ jsonrpc: "2.0", id: requestId++, method, params }, "*");
    };
    const callTool = (name, argumentsValue) => postRpc("tools/call", { name, arguments: argumentsValue || {} });

    function getProjectItems(data) {
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.openItems) || Array.isArray(data.exclusiveItems)) {
        return [...(data.openItems || []), ...(data.exclusiveItems || [])];
      }
      return [];
    }

    function renderProjects() {
      const data = readPayload();
      const items = getProjectItems(data).slice(0, 8);
      const body = items.map((item) => {
        const badges = [
          item.isUrgent ? '<span class="chip red">Urgente</span>' : "",
          item.isFeatured ? '<span class="chip blue">Destaque</span>' : "",
          item.isExclusive ? '<span class="chip">Exclusivo</span>' : "",
        ].join("");
        const detailsArgs = {
          accountId: latestToolInput?.accountId,
          projectId: item.projectId,
          projectSlug: item.projectSlug
        };
        return '<article class="item">' +
          '<div class="row"><h2 class="item-title">' + escapeHtml(item.title || "Projeto") + '</h2><div class="chips">' + badges + '</div></div>' +
          '<div class="meta">' + escapeHtml([item.subcategoryName || item.categoryName, item.experienceLevel, item.publishedText, item.remainingText].filter(Boolean).join(" - ")) + '</div>' +
          '<div class="text">' + escapeHtml(item.summary || "") + '</div>' +
          chips(item.tags) +
          '<div class="metrics">' +
          metric("Propostas", item.proposalsCount) +
          metric("Interessados", item.interestedCount) +
          metric("Cliente", item.client?.ratingText || item.client?.reviewsCount) +
          '</div>' +
          '<div class="actions"><button data-tool="projects_get" data-args="' + escapeHtml(JSON.stringify(detailsArgs)) + '">Analisar</button><button class="secondary" data-tool="projects_getBidContext" data-args="' + escapeHtml(JSON.stringify(detailsArgs)) + '">Preparar proposta</button></div>' +
        '</article>';
      }).join("");
      render('<header class="header"><div><h1 class="title">Projetos encontrados</h1><div class="subtitle">Triagem rapida para escolher onde vale abrir detalhe.</div></div></header>' + (body || '<p class="empty">Nenhum projeto retornado por esta chamada.</p>'));
    }

    function renderProjectDetail() {
      const item = readPayload();
      const bidArgs = {
        accountId: latestToolInput?.accountId,
        projectId: item.projectId,
        projectSlug: item.projectSlug
      };
      const flags = [
        item.isUrgent ? '<span class="chip red">Urgente</span>' : "",
        item.isFeatured ? '<span class="chip blue">Destaque</span>' : "",
        item.requiresSubscriber ? '<span class="chip">Assinante</span>' : "",
        item.userCanBid === false ? '<span class="chip red">Bloqueado</span>' : '<span class="chip green">Pode propor</span>',
      ].join("");
      const competitors = (item.competitors || []).slice(0, 4).map((person) =>
        '<div class="message">' + escapeHtml([person.name, person.status, person.submittedAt].filter(Boolean).join(" - ")) + '</div>'
      ).join("");
      render('<header class="header"><div><h1 class="title">' + escapeHtml(item.title || "Detalhe do projeto") + '</h1><div class="subtitle">' + escapeHtml([item.categoryName, item.subcategoryName, item.experienceLevel].filter(Boolean).join(" - ")) + '</div></div></header>' +
        '<div class="chips">' + flags + '</div>' +
        '<div class="text">' + escapeHtml(item.description || item.summary || "") + '</div>' +
        chips([...(item.tags || []), ...(item.preferredTechnologies || [])]) +
        '<div class="metrics">' +
        metric("Orcamento", item.budgetText || [item.budgetMin, item.budgetMax].filter(Boolean).join(" - ")) +
        metric("Conexoes", item.connectionsCost) +
        metric("Propostas", item.proposalsCount) +
        metric("Interessados", item.interestedCount) +
        '</div>' +
        (competitors ? '<section class="list">' + competitors + '</section>' : "") +
        '<div class="actions"><button data-tool="projects_getBidContext" data-args="' + escapeHtml(JSON.stringify(bidArgs)) + '">Ver contexto de proposta</button></div>');
    }

    function renderProposal() {
      const data = readPayload();
      const isSent = data.ok === true && data.dryRun !== true && (data.connectionsSpent || data.projectId);
      const offer = money(data.minimumOfferCents || data.bidContext?.minimumOfferCents);
      const canBid = data.userCanBid ?? data.bidContext?.userCanBid;
      const requiresSubscriber = data.requiresSubscriber ?? data.bidContext?.requiresSubscriber;
      render('<header class="header"><div><h1 class="title">' + (isSent ? 'Proposta enviada' : 'Contexto de proposta') + '</h1><div class="subtitle">Valide elegibilidade e valores antes de enviar.</div></div></header>' +
        '<div class="metrics">' +
        metric("Oferta minima", offer) +
        metric("Conexoes", data.connectionsCost ?? data.bidContext?.connectionsCost ?? data.connectionsSpent) +
        metric("Elegivel", canBid === false ? "Nao" : "Sim") +
        metric("Assinatura", requiresSubscriber ? "Necessaria" : "Nao exigida") +
        '</div>' +
        '<div class="notice">Nao compartilhe contato externo, links de WhatsApp, email ou pagamento fora da plataforma.</div>' +
        (data.ok === false ? '<div class="notice">' + escapeHtml(data.error || "Falha ao enviar proposta.") + '</div>' : ""));
    }

    function renderInbox() {
      const data = readPayload();
      const conversations = Array.isArray(data.items) ? data.items : [];
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const notifications = Array.isArray(data.items) && data.items.some((item) => item.message) ? data.items : [];
      const rows = (messages.length ? messages : conversations.length ? conversations : notifications).slice(0, 8).map((item) => {
        const title = item.title || item.authorType || item.conversationId || item.createdAt || "Item";
        const body = item.text || item.lastMessagePreview || item.message || "";
        return '<article class="item"><div class="row"><h2 class="item-title">' + escapeHtml(title) + '</h2>' +
          (item.unreadCount ? '<span class="chip green">' + escapeHtml(item.unreadCount) + ' nova(s)</span>' : '') +
          '</div><div class="text">' + escapeHtml(body) + '</div></article>';
      }).join("");
      render('<header class="header"><div><h1 class="title">Inbox 99Freelas</h1><div class="subtitle">Mensagens e notificacoes relevantes para resposta rapida.</div></div></header>' + (rows || '<p class="empty">Nenhuma conversa ou mensagem retornada.</p>'));
    }

    function renderAccount() {
      const data = readPayload();
      const session = data.session || {};
      const counts = data.counts || {};
      render('<header class="header"><div><h1 class="title">Conta 99Freelas</h1><div class="subtitle">Status compacto antes de operar propostas e inbox.</div></div></header>' +
        '<div class="metrics">' +
        metric("Conexoes", data.connections ?? data.availableConnections ?? data.connectionsAvailable) +
        metric("Assinante", data.isSubscriber === true ? "Sim" : data.isSubscriber === false ? "Nao" : undefined) +
        metric("Sessao", session.isAuthenticated === false || data.cookiesLoaded === false ? "Inativa" : "Ativa") +
        metric("Inbox", counts.inbox ?? counts.naoLidas ?? counts.unread) +
        '</div>' +
        (data.ok === false ? '<div class="notice">' + escapeHtml(data.error || "Conta indisponivel.") + '</div>' : ""));
    }

    function renderCurrent() {
      if (WIDGET.variant === "projects") renderProjects();
      else if (WIDGET.variant === "project-detail") renderProjectDetail();
      else if (WIDGET.variant === "proposal") renderProposal();
      else if (WIDGET.variant === "inbox") renderInbox();
      else renderAccount();
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      const method = message.method;
      if (method === "ui/initialize") {
        latestToolInput = message.params?.toolInput || latestToolInput;
        latestToolResult = message.params?.toolResult || latestToolResult;
        renderCurrent();
      }
      if (method === "ui/notifications/tool-input") {
        latestToolInput = message.params?.toolInput || message.params || latestToolInput;
      }
      if (method === "ui/notifications/tool-result") {
        latestToolResult = message.params?.toolResult || message.params;
        renderCurrent();
      }
    });

    app.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-tool]");
      if (!target) return;
      const args = JSON.parse(target.dataset.args || "{}");
      callTool(target.dataset.tool, args);
    });

    renderCurrent();
    postRpc("ui/ready", { variant: WIDGET.variant });
  </script>
</body>
</html>`;

export const listWidgetResources = (): Resource[] =>
  widgetDefinitions.map((definition) => ({
    uri: definition.uri,
    name: definition.name,
    title: definition.title,
    description: definition.description,
    mimeType: "text/html",
    _meta: {
      "openai/widgetDescription": definition.description,
      "openai/widgetPrefersBorder": true,
    },
  }));

export const isWidgetResourceUri = (uri: string): boolean =>
  WIDGET_URIS.includes(uri as WidgetUri);

export const getWidgetResourceHtml = (uri: string): string => {
  const definition = widgetDefinitions.find((item) => item.uri === uri);
  if (!definition) {
    throw new Error(`Unknown widget resource: ${uri}`);
  }
  return sharedWidgetHtml(definition);
};

export const getWidgetResourceMimeType = (uri: string): string | undefined =>
  isWidgetResourceUri(uri) ? "text/html" : undefined;
