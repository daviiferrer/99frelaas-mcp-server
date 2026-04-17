const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const parseToolText = (result) => JSON.parse(result.content[0].text);

let tempDir = "";

test.beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mcp99-stress-suite-"));
  process.env.STATE_DB_FILE = join(tempDir, "state.sqlite");
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
  process.env.LOG_LEVEL = "error";
  process.env.LOG_STDERR = "false";
});

test.afterEach(async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  StateDatabase.closeAll();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  delete process.env.STATE_DB_FILE;
  delete process.env.SESSION_ENCRYPTION_KEY_BASE64;
  delete process.env.LOG_LEVEL;
  delete process.env.LOG_STDERR;
});

test("mock stress suite covers all tools in parallel across accounts", async () => {
  const { createServer } = require("../dist/server/createServer.js");

  const requests = [];
  const cookiesByAccount = new Map();
  const proposalHashes = new Set();
  const messageHashes = new Set();

  const ctx = {
    sessionManager: {
      async requireCookies(accountId = "default") {
        const cookies = [{ name: "sgcn", value: `cookie-${accountId}`, domain: ".99freelas.com.br" }];
        cookiesByAccount.set(accountId, cookies);
        return cookies;
      },
      async createOrUpdateSession({ accountId = "default", cookies = [] }) {
        cookiesByAccount.set(accountId, cookies);
        return { sessionId: `session-${accountId}` };
      },
      async checkSession(accountId = "default") {
        return {
          isAuthenticated: true,
          cookiesPresent: ["sgcn"],
          sessionId: `session-${accountId}`,
          username: `user-${accountId}`,
        };
      },
      async clearSession() {},
    },
    httpClient: {
      setCookies() {},
      async request(url, init = {}) {
        const path = typeof url === "string" ? url : String(url);
        const cookie = (init.headers && init.headers.cookie) || "";
        requests.push({ path, cookie });
        const encoder = new TextEncoder();
        let body = "";
        if (path.includes("/services/project/enviarProposta")) {
          body = JSON.stringify({ status: { id: 1 }, directResult: false });
        } else if (path.includes("/services/user/carregarConversas")) {
          body = JSON.stringify([{ idConversa: 11, titulo: "Chat", qtdNaoLidas: 2 }]);
        } else if (path.includes("/services/consultas/listarMensagensConversa")) {
          body = JSON.stringify([{ idMensagem: 99, mensagem: "Olá", tipoAutor: "client" }]);
        } else if (path.includes("/services/user/enviarMensagemConversa")) {
          body = JSON.stringify({ status: { id: 1 } });
        } else if (path.includes("/services/user/editarPerfil")) {
          body = JSON.stringify({ status: { id: 1 } });
        } else if (path.includes("/profile/edit")) {
          body = `
            <h2 class="item-title">Vendas & Marketing</h2>
            <div class="items"><label for="chk101"><input id="chk101" type="checkbox" /><span>Marketing Digital</span></label></div>
            <input id="nome" value="Carlos Vieira" />
            <input id="nickname" value="carlos-vieira" />
            <input id="titulo-profissional" value="Freelancer" />
            <textarea id="descricao">Sobre mim</textarea>
            <textarea id="resumo-experiencia-profissional">Resumo</textarea>
            <select id="habilidades"><option value="1648">Marketing Digital</option></select>
            <button>Remover foto</button>
          `;
        } else if (path.includes("/user/")) {
          body = `
            <h1>Cliente X | 99Freelas</h1>
            <p>(5.0 - 1 avaliação)</p>
            <p>Projetos concluídos: 1 | Recomendações: 1 | Registrado desde: 24/03/2026</p>
            <h2>Histórico de projetos & Avaliações:</h2>
            <a href="/project/clipador-1">Clipador</a>
            <p>5.0</p>
            <h2>Projetos (Aguardando Propostas):</h2>
            <a href="/project/gestao-744497">Gestão</a>
            <p>Gestão de Mídias Sociais | Orçamento: Aberto | Publicado: 2 dias atrás | Propostas: 51</p>
          `;
        } else if (path.includes("/subscriptions")) {
          body = "Nenhuma assinatura encontrada.";
        } else if (path.includes("/dashboard")) {
          body = "saldo: 12 conexoes";
        } else if (path.includes("/projects?")) {
          body = `
            <li class="result-item" data-id="10" data-nome="Projeto A">
              <h1 class="title"><a href="/project/a-10?fs=t">Projeto A</a></h1>
              <p class="item-text information">Resumo</p>
            </li>
          `;
        } else if (path.includes("/project/bid/")) {
          body = "promover proposta 3 conexões Oferta mínima: R$ 50,00";
        } else if (path.includes("/project/")) {
          body = `<div class="project-description">Desc</div><a href="/project/bid/a-10">Bid</a>1 conexoes<h2>Cliente</h2><a href="/user/joao">Joao Silva</a>(5.0 - 1 avaliação)Projetos concluídos: 1 | Recomendações: 2 | Registrado desde: 24/03/2026`;
        } else {
          body = "saldo: 12 conexoes";
        }
        return {
          ok: true,
          url: path,
          headers: { get: () => "text/html; charset=utf-8" },
          arrayBuffer: async () => encoder.encode(body).buffer,
          text: async () => body,
        };
      },
    },
    projectsAdapter: {
      listCategories() {
        return [
          { slug: "web-mobile-e-software", label: "Web & Software" },
          { slug: "design-e-criacao", label: "Design" },
        ];
      },
      async list({ categorySlug, page }) {
        return { items: [{ projectId: 10, projectSlug: `${categorySlug}-10`, title: `Projeto ${page}`, url: "u", tags: [], categorySlug, page }], page, hasMore: false };
      },
      async listByAvailability({ categorySlug, page }) {
        return {
          openItems: [{ projectId: 10, projectSlug: `${categorySlug}-10`, title: `Projeto ${page}`, url: "u", tags: [], categorySlug, page }],
          exclusiveItems: [{ projectId: 20, projectSlug: `exclusive-${page}`, title: "VIP", url: "u2", tags: [], isExclusive: true, exclusiveUnlockText: "Em 1h" }],
          pagesScanned: 1,
          rateLimitNote: "ok",
        };
      },
      async get({ projectId, projectSlug }) {
        return { projectId, projectSlug, title: "A", url: "u", tags: [], description: "D", client: { username: "joao", profileUrl: "https://www.99freelas.com.br/user/joao" }, clientSignals: { projectsCompleted: 1, recommendationsCount: 2 } };
      },
      async getBidContext({ projectId, projectSlug }) {
        return { projectId, projectSlug, minimumOfferCents: 5000, userCanBid: true, bidUrl: `/project/bid/${projectSlug}-${projectId}`, connectionsCost: 1, flags: { supportsPromote: true } };
      },
    },
    proposalsAdapter: {
      async send({ projectId, dryRun = false }) {
        if (!dryRun) proposalHashes.add(projectId);
        return { ok: true, projectId, responseStatusId: 1, directResult: false, connectionsSpent: dryRun ? 0 : 1 };
      },
    },
    inboxAdapter: {
      async listConversations() {
        return [{ conversationId: 11, title: "Chat", unreadCount: 2 }];
      },
      async getMessages({ conversationId }) {
        return [{ messageId: 99, text: `conv-${conversationId}` }];
      },
      async sendMessage({ conversationId, text }) {
        messageHashes.add(`${conversationId}:${text}`);
        return { ok: true, conversationId };
      },
      async getThread({ conversationId }) {
        return { conversation: { conversationId }, messages: [{ messageId: 99, text: `conv-${conversationId}` }], counts: { inbox: 2 } };
      },
      async getDirectoryCounts() {
        return { inbox: 2, unread: 1 };
      },
    },
    accountAdapter: {
      async getConnections() {
        return { connections: 12 };
      },
      async getDashboardSummary() {
        return { isLoggedIn: true, connections: 12, isSubscriber: false };
      },
      async getSubscriptionStatus() {
        return { isLoggedIn: true, isSubscriber: false, source: "subscriptions-page" };
      },
    },
    profileAdapter: {
      async getInterestCatalog() {
        return [{ title: "Vendas & Marketing", items: ["Marketing Digital"] }];
      },
      async getEditState() {
        return { interestCatalog: [], interestAreaIds: [101], skillIds: [1648], photoPresent: true, nickname: "carlos-vieira" };
      },
      async update() {
        return { ok: true, responseStatusId: 1 };
      },
      async getPublicProfile({ username }) {
        return { username, profileUrl: `https://www.99freelas.com.br/user/${username}`, displayName: "Cliente X", history: [], openProjects: [] };
      },
    },
    rateLimiter: { consume() {} },
    cacheStore: {
      async hasProposal(projectId, accountId) {
        return proposalHashes.has(projectId) && accountId === "acc_0";
      },
      async markProposal(projectId) {
        proposalHashes.add(projectId);
      },
      async hasMessageHash(hash) {
        return messageHashes.has(hash);
      },
      async markMessageHash(hash) {
        messageHashes.add(hash);
      },
    },
    auditLog: { async append() {} },
    proposalsDailyLimit: 99,
    proposalDayCounter: new Map(),
  };

  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "stress-suite", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const tools = await client.listTools();
  assert.equal(tools.tools.length, 25);

  const scenarios = [
    ["auth_checkSession", {}],
    ["auth_importCookies", { cookiesJson: JSON.stringify([{ name: "JSESSIONID", value: "x", domain: ".99freelas.com.br" }]) }],
    ["auth_clearSession", {}],
    ["projects_listCategories", {}],
    ["profile_getInterestCatalog", {}],
    ["skills_getCatalog", { limit: 5 }],
    ["skills_getStacks", {}],
    ["skills_getSelectionGuide", {}],
    ["projects_list", { accountId: "acc_0", categorySlug: "web-mobile-e-software", page: 1 }],
    ["projects_listByAvailability", { accountId: "acc_1", categorySlug: "web-mobile-e-software", page: 1, maxPages: 2 }],
    ["projects_get", { accountId: "acc_2", projectId: 10, projectSlug: "abc" }],
    ["projects_getBidContext", { accountId: "acc_3", projectId: 10, projectSlug: "abc" }],
    ["inbox_listConversations", { accountId: "acc_0" }],
    ["inbox_getMessages", { accountId: "acc_1", conversationId: 11 }],
    ["inbox_sendMessage", { accountId: "acc_2", conversationId: 11, text: "oi" }],
    ["inbox_getDirectoryCounts", { accountId: "acc_3" }],
    ["account_getConnections", { accountId: "acc_4" }],
    ["account_getDashboardSummary", { accountId: "acc_0" }],
    ["account_getSubscriptionStatus", { accountId: "acc_1" }],
    ["profiles_get", { accountId: "acc_2", username: "Prkvit" }],
    ["profile_getEditState", { accountId: "acc_3" }],
    ["profile_update", { accountId: "acc_4", name: "Carlos Vieira", nickname: "carlos-vieira", professionalTitle: "Freelancer", about: "Sobre mim", professionalSummary: "Resumo", interestAreaIds: [101], skillIds: [1648], photoPresent: true }],
    ["system_health", {}],
  ];

  const parallel = [];
  for (let round = 0; round < 4; round++) {
    for (const [name, args] of scenarios) {
      parallel.push(
        client.callTool({ name, arguments: args }).then((result) => {
          assert.equal(result.isError, false, `${name} should succeed`);
          return result;
        }),
      );
    }
  }

  const results = await Promise.all(parallel);
  assert.equal(results.length, scenarios.length * 4);
  assert.equal(cookiesByAccount.size >= 5, true);
  assert.equal(requests.length > 0, true);
  assert.equal(messageHashes.has("11:oi"), true);

  const proposal = await client.callTool({
    name: "proposals_send",
    arguments: {
      accountId: "acc_4",
      projectId: 777,
      projectSlug: "abc",
      offerCents: 50000,
      durationDays: 5,
      proposalText: "texto de proposta suficiente",
      promote: false,
      dryRun: false,
    },
  });
  assert.equal(proposal.isError, false);
  const proposalParsed = parseToolText(proposal);
  assert.equal(proposalParsed.responseStatusId, 1);

  await client.close();
  await server.close();
});
