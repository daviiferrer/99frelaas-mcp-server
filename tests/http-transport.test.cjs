const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const makeCtx = () => ({
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
    async listSessions() {
      return [];
    },
  },
  httpClient: { async request() { return { ok: true, headers: { get: () => "text/html" }, arrayBuffer: async () => new ArrayBuffer(0) }; } },
  projectsAdapter: {
    listCategories() { return []; },
    async list() { return { items: [], page: 1, hasMore: false }; },
    async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 0, rateLimitNote: "" }; },
    async get() { return {}; },
    async getBidContext() { return {}; },
  },
  proposalsAdapter: { async send() { return { ok: true }; } },
  inboxAdapter: {
    async listConversations() { return []; },
    async getMessages() { return []; },
    async getThread() { return { conversation: {}, messages: [], counts: {} }; },
    async sendMessage() { return { ok: true }; },
    async getDirectoryCounts() { return {}; },
    async listNotifications() { return { items: [] }; },
  },
  accountAdapter: {
    async getConnections() { return { connections: 0 }; },
    async getDashboardSummary() { return { isLoggedIn: false, connections: 0, isSubscriber: false }; },
    async getSubscriptionStatus() { return { isLoggedIn: false, isSubscriber: false, source: "subscriptions-page" }; },
  },
  profileAdapter: {
    async getInterestCatalog() { return []; },
    async getEditState() { return { interestAreaIds: [], skillIds: [], photoPresent: true }; },
    async update() { return { ok: true }; },
    async getPublicProfile() { return { profileUrl: "https://www.99freelas.com.br/user/x" }; },
  },
  rateLimiter: { async consume() {} },
  cacheStore: {
    async hasProposal() { return false; },
    async markProposal() {},
    async hasMessageHash() { return false; },
    async markMessageHash() {},
  },
  auditLog: { async append() {} },
});

test("http transport exposes health and accepts mcp requests", async () => {
  const { createServer } = require("../dist/server/createServer.js");
  const { startHttpServer } = require("../dist/transport/http.js");

  const running = await startHttpServer(() => createServer(makeCtx()), {
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const health = await fetch(running.url.replace("/mcp", "/healthz"));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, transport: "http" });

    const transport = new StreamableHTTPClientTransport(new URL(running.url));
    const client = new Client({ name: "http-test-client", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.some((tool) => tool.name === "system_health"), true);
    await client.close();
  } finally {
    await running.close();
  }
});
