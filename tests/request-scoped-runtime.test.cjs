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
  tempDir = await mkdtemp(join(tmpdir(), "mcp99-sqlite-"));
  process.env.STATE_DB_FILE = join(tempDir, "state.sqlite");
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 8).toString("base64");
});

test.afterEach(async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  StateDatabase.closeAll();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  delete process.env.STATE_DB_FILE;
  delete process.env.SESSION_ENCRYPTION_KEY_BASE64;
});

test("authenticated requests use request-scoped http clients per account", async () => {
  const { createServer } = require("../dist/server/createServer.js");
  const { HttpClient } = require("../dist/clients/httpClient.js");

  const originalFetch = global.fetch;
  const requestedCookies = [];
  global.fetch = async (url, init) => {
    requestedCookies.push((init && init.headers && init.headers.cookie) || "");
    return {
      ok: true,
      url: String(url),
      headers: { get: () => "text/html; charset=utf-8" },
      arrayBuffer: async () => new TextEncoder().encode("Saldo: 3 conexoes").buffer,
    };
  };

  try {
    const baseHttp = new HttpClient("https://www.99freelas.com.br");
    const ctx = {
      sessionManager: {
        async requireCookies(accountId) {
          return [{ name: "sgcn", value: `cookie-${accountId}`, domain: ".99freelas.com.br" }];
        },
        async createOrUpdateSession() {
          return { sessionId: "s" };
        },
        async checkSession() {
          return { isAuthenticated: true, cookiesPresent: ["sgcn"], sessionId: "s" };
        },
        async clearSession() {},
      },
      httpClient: baseHttp,
      projectsAdapter: {
        listCategories() { return []; },
        async list() { return { items: [], page: 1, hasMore: false }; },
        async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 0, rateLimitNote: "" }; },
        async get() { return {}; },
        async getBidContext() { return {}; },
      },
      proposalsAdapter: { async send() { return { ok: true, projectId: 1 }; } },
      inboxAdapter: {
        async listConversations() { return []; },
        async getMessages() { return []; },
        async sendMessage() { return { ok: true }; },
        async getThread() { return { conversation: {}, messages: [], counts: {} }; },
        async getDirectoryCounts() { return {}; },
      },
      accountAdapter: { async getConnections() { return { connections: 0 }; }, async getDashboardSummary() { return { isLoggedIn: true, connections: 0, isSubscriber: false }; }, async getSubscriptionStatus() { return { isLoggedIn: true, isSubscriber: false, source: "subscriptions-page" }; } },
      profileAdapter: {
        async getInterestCatalog() { return []; },
        async getEditState() { return { interestAreaIds: [], skillIds: [], photoPresent: true }; },
        async update() { return { ok: true }; },
        async getPublicProfile() { return { profileUrl: "https://www.99freelas.com.br/user/x" }; },
      },
      rateLimiter: { consume() {} },
      cacheStore: {
        async hasProposal() { return false; },
        async markProposal() {},
        async hasMessageHash() { return false; },
        async markMessageHash() {},
      },
      auditLog: { async append() {} },
      proposalsDailyLimit: 10,
      proposalDayCounter: new Map(),
    };

    const server = createServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "scoped-runtime-client", version: "0.1.0" }, { capabilities: {} });
    await client.connect(clientTransport);

    const first = parseToolText(await client.callTool({ name: "account_getConnections", arguments: { accountId: "acc_a" } }));
    const second = parseToolText(await client.callTool({ name: "account_getConnections", arguments: { accountId: "acc_b" } }));

    assert.equal(first.connections, 3);
    assert.equal(second.connections, 3);
    assert.equal(baseHttp.getCookies().length, 0);
    assert.equal(requestedCookies.some((value) => /sgcn=cookie-acc_a/.test(value)), true);
    assert.equal(requestedCookies.some((value) => /sgcn=cookie-acc_b/.test(value)), true);

    await client.close();
    await server.close();
  } finally {
    global.fetch = originalFetch;
  }
});

test("agentId remains request metadata and does not trigger MCP ownership errors", async () => {
  const { createServer } = require("../dist/server/createServer.js");

  const ctx = {
    sessionManager: {
      async requireCookies() {
        return [{ name: "JSESSIONID", value: "x", domain: ".99freelas.com.br" }];
      },
      async createOrUpdateSession() {
        return { sessionId: "s" };
      },
      async checkSession() {
        return { isAuthenticated: true, cookiesPresent: ["JSESSIONID"], sessionId: "s" };
      },
      async clearSession() {},
    },
    httpClient: { async request() { return { ok: true }; } },
    projectsAdapter: {
      listCategories() { return []; },
      async list() { return { items: [], page: 1, hasMore: false }; },
      async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 0, rateLimitNote: "" }; },
      async get() { return {}; },
      async getBidContext() { return { minimumOfferCents: 1, userCanBid: true }; },
    },
    proposalsAdapter: { async send() { return { ok: true, projectId: 1 }; } },
    inboxAdapter: {
      async listConversations() { return []; },
      async getMessages() { return []; },
      async sendMessage() { return { ok: true }; },
      async getThread() { return { conversation: {}, messages: [], counts: {} }; },
      async getDirectoryCounts() { return {}; },
    },
    accountAdapter: {
      async getConnections() { return { connections: 1 }; },
      async getDashboardSummary() { return { isLoggedIn: true, connections: 1, isSubscriber: false }; },
      async getSubscriptionStatus() { return { isLoggedIn: true, isSubscriber: false, source: "subscriptions-page" }; },
    },
    profileAdapter: {
      async getInterestCatalog() { return []; },
      async getEditState() { return { interestAreaIds: [], skillIds: [], photoPresent: true }; },
      async update() { return { ok: true }; },
      async getPublicProfile() { return { profileUrl: "https://www.99freelas.com.br/user/x" }; },
    },
    rateLimiter: { consume() {} },
    cacheStore: {
      async hasProposal() { return false; },
      async markProposal() {},
      async hasMessageHash() { return false; },
      async markMessageHash() {},
    },
    auditLog: { async append() {} },
    proposalsDailyLimit: 10,
    proposalDayCounter: new Map(),
  };

  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "agent-metadata-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const result = await client.callTool({
    name: "projects_list",
    arguments: { accountId: "acc_1", agentId: "scout:a1", categorySlug: "web-mobile-e-software", page: 1 },
  });
  assert.equal(result.isError, false);

  await client.close();
  await server.close();
});
