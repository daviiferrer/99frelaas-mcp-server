const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { mkdtemp, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const parseToolText = (result) => JSON.parse(result.content[0].text);
const responseText = (text, url = "https://www.99freelas.com.br/x", ok = true) => ({
  ok,
  url,
  headers: { get: () => "text/html; charset=utf-8" },
  arrayBuffer: async () => new TextEncoder().encode(text).buffer,
});

let tempDir = "";

test.beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mcp99-"));
  process.env.STATE_DB_FILE = join(tempDir, "state.sqlite");
  process.env.SESSION_FILE = join(tempDir, "sessions.json");
  process.env.CACHE_FILE = join(tempDir, "cache.json");
  process.env.AUDIT_LOG_FILE = join(tempDir, "audit.log");
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString("base64");
});

test.afterEach(async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  StateDatabase.closeAll();
  if (tempDir) await require("node:fs/promises").rm(tempDir, { recursive: true, force: true });
  delete process.env.STATE_DB_FILE;
  delete process.env.SESSION_FILE;
  delete process.env.CACHE_FILE;
  delete process.env.AUDIT_LOG_FILE;
  delete process.env.SESSION_ENCRYPTION_KEY_BASE64;
});

test("server tools end-to-end in memory", async () => {
  const { createServer } = require("../dist/server/createServer.js");

  const state = {
    isAuthenticated: false,
    cookiesPresent: [],
    sessionId: undefined,
    username: undefined,
  };
  const sentProposals = new Set();
  const sentMsgs = new Set();

  const ctx = {
    sessionManager: {
      async createOrUpdateSession({ username }) {
        state.isAuthenticated = true;
        state.cookiesPresent = ["JSESSIONID"];
        state.sessionId = "sess_01";
        state.username = username;
        return { sessionId: "sess_01" };
      },
      async requireCookies() {
        if (!state.isAuthenticated) throw new Error("No active authenticated session");
        return [{ name: "JSESSIONID", value: "x", domain: ".99freelas.com.br" }];
      },
      async checkSession() {
        return {
          isAuthenticated: state.isAuthenticated,
          cookiesPresent: state.cookiesPresent,
          sessionId: state.sessionId,
          username: state.username,
        };
      },
      async clearSession() {
        state.isAuthenticated = false;
        state.cookiesPresent = [];
      },
    },
    httpClient: {
      setCookies() {},
      createChildWithCookies() {
        return {
          async request() {
            return responseText('<a href="/user/carlos-vieira-mkt">Meu perfil</a>');
          },
        };
      },
      async request() {
        return responseText('<a href="/user/carlos-vieira-mkt">Meu perfil</a>');
      },
    },
    projectsAdapter: {
      listCategories() {
        return [{ slug: "administracao-e-contabilidade", label: "Administração & Contabilidade" }];
      },
      async list({ categorySlug, page }) {
        return { items: [{ projectId: 10, projectSlug: "abc-10", title: "A", url: "u", tags: [], categorySlug, page }], page, hasMore: false };
      },
      async listByAvailability({ categorySlug, page }) {
        return {
          openItems: [{ projectId: 10, projectSlug: "abc-10", title: "A", url: "u", tags: [], categorySlug, page }],
          exclusiveItems: [{ projectId: 20, projectSlug: "vip-20", title: "VIP", url: "u2", tags: [], isExclusive: true, exclusiveUnlockText: "Ficará disponível para todos os profissionais em 1h" }],
          pagesScanned: 1,
          nextExclusiveOpensAt: "2026-04-16T12:00:00.000Z",
          rateLimitNote: "test",
        };
      },
      async get({ projectId, projectSlug }) {
        return { projectId, projectSlug, title: "A", url: "u", tags: [], description: "D" };
      },
      async getBidContext({ projectId, projectSlug }) {
        return { projectId, bidUrl: `/project/bid/${projectSlug}-${projectId}`, connectionsCost: 1, flags: { supportsPromote: true } };
      },
    },
    proposalsAdapter: {
      async send({ projectId }) {
        sentProposals.add(projectId);
        return { ok: true, projectId, responseStatusId: 1, directResult: false };
      },
    },
    inboxAdapter: {
      async listConversations() {
        return { items: [{ conversationId: 11, title: "Chat" }], start: 0, limit: 20, hasMore: false };
      },
      async getMessages({ conversationId }) {
        return [{ messageId: 99, text: `conv-${conversationId}` }];
      },
      async sendMessage({ conversationId, text }) {
        if (text === "falha") return { ok: false };
        sentMsgs.add(`${conversationId}:${text}`);
        return { ok: true };
      },
      async getDirectoryCounts() {
        return { inbox: 2 };
      },
    },
    accountAdapter: {
      async getConnections() {
        return { connections: 5 };
      },
      async getDashboardSummary() {
        return { isLoggedIn: true, connections: 5, isSubscriber: false };
      },
      async getSubscriptionStatus() {
        return { isLoggedIn: true, isSubscriber: false, hasSubscription: false, emptyState: true, source: "subscriptions-page" };
      },
    },
    profileAdapter: {
      async getInterestCatalog() {
        return [{ title: "Administração & Contabilidade", items: ["Análise de Dados & Estatística"] }];
      },
      async getEditState() {
        return { interestCatalog: [], interestAreaIds: [], skillIds: [], photoPresent: true };
      },
      async update() {
        return { ok: true };
      },
      async getPublicProfile({ username }) {
        return { profileUrl: `https://www.99freelas.com.br/user/${username}`, username, displayName: "Fábio p." };
      },
    },
    rateLimiter: { consume() {} },
    cacheStore: {
      async hasProposal(id) {
        return sentProposals.has(id);
      },
      async markProposal(id) {
        sentProposals.add(id);
      },
      async hasMessageHash(hash) {
        return sentMsgs.has(hash);
      },
      async markMessageHash(hash) {
        sentMsgs.add(hash);
      },
    },
    auditLog: { async append() {} },
    proposalsDailyLimit: 5,
    proposalDayCounter: new Map(),
  };

  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const tools = await client.listTools();
  assert.equal(tools.tools.length, 25);

  let out = parseToolText(await client.callTool({ name: "auth_checkSession", arguments: {} }));
  assert.equal(out.session.isAuthenticated, false);

  out = parseToolText(await client.callTool({ name: "projects_listCategories", arguments: {} }));
  assert.equal(out.items[0].slug, "administracao-e-contabilidade");

  out = parseToolText(await client.callTool({
    name: "auth_importCookies",
    arguments: { cookiesJson: JSON.stringify([{ name: "JSESSIONID", value: "x", domain: ".99freelas.com.br" }]) },
  }));
  assert.equal(out.ok, true);
  assert.equal(out.sessionId, "sess_01");
  assert.equal(out.username, "carlos-vieira-mkt");

  out = parseToolText(await client.callTool({ name: "profile_getInterestCatalog", arguments: {} }));
  assert.equal(Array.isArray(out.items), true);
  out = parseToolText(await client.callTool({ name: "skills_getCatalog", arguments: { limit: 10 } }));
  assert.equal(out.total >= 2000, true);
  assert.equal(out.items.length <= 10, true);
  out = parseToolText(await client.callTool({ name: "skills_getCatalog", arguments: { query: "docker", limit: 5 } }));
  assert.equal(out.items.some((item) => item.text === "Docker"), true);
  out = parseToolText(await client.callTool({ name: "skills_getStacks", arguments: {} }));
  assert.match(out.markdown, /Curated Skill Stacks/);
  out = parseToolText(await client.callTool({ name: "skills_getSelectionGuide", arguments: {} }));
  assert.match(out.markdown, /Skill Selection Guide/);

  out = parseToolText(await client.callTool({ name: "projects_list", arguments: { categorySlug: "web-mobile-e-software", page: 1 } }));
  assert.equal(out.items.length, 1);
  out = parseToolText(await client.callTool({ name: "projects_listByAvailability", arguments: { categorySlug: "web-mobile-e-software", page: 1, maxPages: 1 } }));
  assert.equal(out.openItems.length, 1);
  assert.equal(out.exclusiveItems[0].isExclusive, true);
  out = parseToolText(await client.callTool({ name: "projects_get", arguments: { projectId: 10, projectSlug: "abc" } }));
  assert.equal(out.projectId, 10);
  out = parseToolText(await client.callTool({ name: "projects_getBidContext", arguments: { projectId: 10, projectSlug: "abc" } }));
  assert.equal(out.connectionsCost, 1);

  out = parseToolText(await client.callTool({
    name: "proposals_send",
    arguments: { projectId: 10, offerCents: 50000, durationDays: 5, proposalText: "texto de proposta suficiente", promote: false, dryRun: false },
  }));
  assert.equal(out.ok, true);

  out = parseToolText(await client.callTool({
    name: "proposals_send",
    arguments: { projectId: 99, offerCents: 50000, durationDays: 5, proposalText: "texto de proposta suficiente", promote: false, dryRun: true },
  }));
  assert.equal(out.connectionsSpent, 0);

  const dupProposal = await client.callTool({
    name: "proposals_send",
    arguments: { projectId: 10, offerCents: 50000, durationDays: 5, proposalText: "texto de proposta suficiente", promote: false, dryRun: false },
  });
  assert.equal(dupProposal.isError, true);

  out = parseToolText(await client.callTool({ name: "inbox_listConversations", arguments: {} }));
  assert.equal(out.items[0].conversationId, 11);
  assert.equal(out.start, 0);
  out = parseToolText(await client.callTool({ name: "inbox_getMessages", arguments: { conversationId: 11 } }));
  assert.match(out.items[0].text, /conv-11/);
  out = parseToolText(await client.callTool({ name: "inbox_sendMessage", arguments: { conversationId: 11, text: "oi" } }));
  assert.equal(out.ok, true);
  out = parseToolText(await client.callTool({ name: "inbox_sendMessage", arguments: { conversationId: 11, text: "falha" } }));
  assert.equal(out.ok, false);
  const dupMsg = await client.callTool({ name: "inbox_sendMessage", arguments: { conversationId: 11, text: "oi" } });
  assert.equal(dupMsg.isError, true);

  out = parseToolText(await client.callTool({ name: "account_getConnections", arguments: {} }));
  assert.equal(out.connections, 5);
  out = parseToolText(await client.callTool({ name: "account_getDashboardSummary", arguments: {} }));
  assert.equal(out.isLoggedIn, true);
  out = parseToolText(await client.callTool({ name: "account_getSubscriptionStatus", arguments: {} }));
  assert.equal(out.isSubscriber, false);
  out = parseToolText(await client.callTool({ name: "profiles_get", arguments: { username: "Prkvit" } }));
  assert.equal(out.username, "Prkvit");
  out = parseToolText(await client.callTool({ name: "system_health", arguments: {} }));
  assert.equal(out.ok, true);

  const { localDateKey } = require("../dist/utils/time.js");
  const today = localDateKey(new Date(), "America/Sao_Paulo");
  ctx.proposalDayCounter.set(`default:${today}:proposals`, ctx.proposalsDailyLimit);
  const limitHit = await client.callTool({
    name: "proposals_send",
    arguments: { projectId: 77, offerCents: 50000, durationDays: 5, proposalText: "texto de proposta suficiente", promote: false, dryRun: false },
  });
  assert.equal(limitHit.isError, true);

  const badArgs = await client.callTool({
    name: "projects_list",
    arguments: {},
  });
  assert.equal(badArgs.isError, true);

  out = parseToolText(await client.callTool({ name: "auth_clearSession", arguments: {} }));
  assert.equal(out.ok, true);
  out = parseToolText(await client.callTool({
    name: "auth_importCookies",
    arguments: { cookiesJson: JSON.stringify([{ name: "JSESSIONID", value: "x", domain: ".99freelas.com.br" }]) },
  }));
  assert.equal(out.ok, true);

  out = parseToolText(await client.callTool({ name: "profile_getEditState", arguments: {} }));
  assert.equal(Array.isArray(out.interestAreaIds), true);
  out = parseToolText(await client.callTool({
    name: "profile_update",
    arguments: {
      name: "Carlos Vieira",
      nickname: "carlos-vieira-mkt",
      professionalTitle: "Freelancer de Marketing",
      about: "Sobre mim",
      professionalSummary: "Resumo",
      interestAreaIds: [1],
      skillIds: [2],
      photoPresent: true,
    },
  }));
  assert.equal(out.ok, true);
  out = parseToolText(await client.callTool({ name: "inbox_getDirectoryCounts", arguments: {} }));
  assert.equal(typeof out.counts, "object");

  const unknown = await client.callTool({ name: "x.unknown", arguments: {} });
  assert.equal(unknown.isError, true);

  await client.close();
  await server.close();
});

test("system.health handles connectivity errors", async () => {
  const { createServer } = require("../dist/server/createServer.js");
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
  const ctx = {
    sessionManager: {
      async requireCookies() {
        return [];
      },
      async createOrUpdateSession() {
        return { sessionId: "s" };
      },
      async checkSession() {
        return { isAuthenticated: false, cookiesPresent: [] };
      },
      async clearSession() {},
    },
    httpClient: {
      setCookies() {},
      async request() {
        throw new Error("net");
      },
    },
    projectsAdapter: { async list() { return { items: [], page: 1, hasMore: false }; }, async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 0, rateLimitNote: "" }; }, async get() { return {}; }, async getBidContext() { return {}; } },
    proposalsAdapter: { async send() { return { ok: true, projectId: 1 }; } },
    inboxAdapter: { async listConversations() { return []; }, async getMessages() { return []; }, async sendMessage() { return { ok: true }; }, async getDirectoryCounts() { return {}; } },
    accountAdapter: {
      async getConnections() { return {}; },
      async getDashboardSummary() { return { isLoggedIn: false, isSubscriber: false }; },
      async getSubscriptionStatus() { return { isLoggedIn: false, isSubscriber: false, source: "subscriptions-page" }; },
    },
    profileAdapter: { async getEditState() { return { interestAreaIds: [], skillIds: [], photoPresent: true }; }, async update() { return { ok: true }; }, async getPublicProfile() { return { profileUrl: "https://www.99freelas.com.br/user/x" }; } },
    rateLimiter: { consume() {} },
    cacheStore: { async hasProposal() { return false; }, async markProposal() {}, async hasMessageHash() { return false; }, async markMessageHash() {} },
    auditLog: { async append() {} },
    proposalsDailyLimit: 1,
    proposalDayCounter: new Map(),
  };

  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client-2", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  const health = await client.callTool({ name: "system_health", arguments: {} });
  const parsed = parseToolText(health);
  assert.equal(parsed.connectivity, false);
  await client.close();
  await server.close();
});

test("authenticated tools auto-import manual cookies fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp99-fallback-"));
  const cookiesFile = join(dir, "manual-cookies.json");
  await writeFile(
    cookiesFile,
    JSON.stringify([{ name: "sgcn", value: "cookie", domain: "www.99freelas.com.br" }]),
    "utf8",
  );

  const originalManualCookiesFile = process.env.MANUAL_COOKIES_FILE;
  const originalAllowFallback = process.env.ALLOW_MANUAL_COOKIE_FALLBACK;
  process.env.MANUAL_COOKIES_FILE = cookiesFile;
  process.env.ALLOW_MANUAL_COOKIE_FALLBACK = "true";
  delete require.cache[require.resolve("../dist/auth/manualCookies.js")];
  delete require.cache[require.resolve("../dist/server/createServer.js")];
  const { createServer } = require("../dist/server/createServer.js");

  let imported = 0;
  const ctx = {
    sessionManager: {
      async requireCookies() {
        throw new Error("missing session");
      },
      async createOrUpdateSession({ cookies }) {
        imported = cookies.length;
        return { sessionId: "fallback_sess" };
      },
      async checkSession() {
        return { isAuthenticated: false, cookiesPresent: [] };
      },
      async clearSession() {},
    },
    httpClient: {
      setCookies(cookies) {
        imported = cookies.length;
      },
      async request() {
        return {
          ok: true,
          url: "https://www.99freelas.com.br/dashboard",
          headers: { get: () => "text/html; charset=utf-8" },
          arrayBuffer: async () => new TextEncoder().encode("saldo 3 conexoes").buffer,
        };
      },
    },
    projectsAdapter: { async list() { return { items: [], page: 1, hasMore: false }; }, async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 0, rateLimitNote: "" }; }, async get() { return {}; }, async getBidContext() { return {}; } },
    proposalsAdapter: { async send() { return { ok: true, projectId: 1 }; } },
    inboxAdapter: { async listConversations() { return []; }, async getMessages() { return []; }, async sendMessage() { return { ok: true }; } },
    accountAdapter: {
      async getConnections() { return { connections: 3 }; },
      async getDashboardSummary() { return { isLoggedIn: true, connections: 3, isSubscriber: false }; },
      async getSubscriptionStatus() { return { isLoggedIn: true, isSubscriber: false, hasSubscription: false, source: "subscriptions-page" }; },
    },
    profileAdapter: { async getEditState() { return { interestAreaIds: [], skillIds: [], photoPresent: true }; }, async update() { return { ok: true }; }, async getPublicProfile() { return { profileUrl: "https://www.99freelas.com.br/user/x" }; } },
    rateLimiter: { consume() {} },
    cacheStore: { async hasProposal() { return false; }, async markProposal() {}, async hasMessageHash() { return false; }, async markMessageHash() {} },
    auditLog: { async append() {} },
    proposalsDailyLimit: 1,
    proposalDayCounter: new Map(),
  };

  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client-3", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  const result = await client.callTool({ name: "account_getConnections", arguments: {} });
  const parsed = parseToolText(result);
  assert.equal(parsed.connections, 3);
  assert.equal(imported, 1);
  await client.close();
  await server.close();
  process.env.MANUAL_COOKIES_FILE = originalManualCookiesFile;
  process.env.ALLOW_MANUAL_COOKIE_FALLBACK = originalAllowFallback;
});
