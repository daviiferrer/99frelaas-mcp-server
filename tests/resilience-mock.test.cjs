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
  tempDir = await mkdtemp(join(tmpdir(), "mcp99-resilience-"));
  process.env.STATE_DB_FILE = join(tempDir, "state.sqlite");
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 6).toString("base64");
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

const createMockContext = (overrides = {}) => ({
  sessionManager: overrides.sessionManager ?? {
    async requireCookies(accountId = "default") {
      return [{ name: "sgcn", value: `cookie-${accountId}`, domain: ".99freelas.com.br" }];
    },
    async createOrUpdateSession({ accountId = "default", cookies = [], username }) {
      return { sessionId: `session-${accountId}`, username, cookiesStored: cookies.length };
    },
    async checkSession(accountId = "default") {
      return { isAuthenticated: true, cookiesPresent: ["sgcn"], sessionId: `session-${accountId}`, username: `user-${accountId}` };
    },
    async clearSession() {},
  },
  httpClient: overrides.httpClient ?? {
    setCookies() {},
    createChildWithCookies(cookies) {
      return {
        async request(path) {
          if (path === "/profile/edit") {
            return {
              ok: true,
              url: "https://www.99freelas.com.br/profile/edit",
              status: 200,
              redirected: false,
              headers: { get: () => "text/html; charset=utf-8" },
              arrayBuffer: async () => new TextEncoder().encode('<a href="/user/carlos-vieira-mkt">Meu perfil</a>').buffer,
            };
          }
          return {
            ok: true,
            url: "https://www.99freelas.com.br/dashboard",
            status: 200,
            redirected: false,
            headers: { get: () => "text/html; charset=utf-8" },
            arrayBuffer: async () => new TextEncoder().encode("saldo: 12 conexoes").buffer,
          };
        },
      };
    },
    async request(path) {
      if (path === "/profile/edit") {
        return {
          ok: true,
          url: "https://www.99freelas.com.br/profile/edit",
          status: 200,
          redirected: false,
          headers: { get: () => "text/html; charset=utf-8" },
          arrayBuffer: async () => new TextEncoder().encode('<a href="/user/carlos-vieira-mkt">Meu perfil</a>').buffer,
        };
      }
      return {
        ok: true,
        url: "https://www.99freelas.com.br/dashboard",
        status: 200,
        redirected: false,
        headers: { get: () => "text/html; charset=utf-8" },
        arrayBuffer: async () => new TextEncoder().encode("saldo: 12 conexoes").buffer,
      };
    },
  },
  projectsAdapter: overrides.projectsAdapter ?? {
    listCategories() { return [{ slug: "web-mobile-e-software", label: "Web & Software" }]; },
    async list() { return { items: [{ projectId: 1, projectSlug: "p-1", title: "Projeto", url: "u", tags: [], categorySlug: "web-mobile-e-software", page: 1 }], page: 1, hasMore: false }; },
    async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 1, rateLimitNote: "" }; },
    async get() { return { projectId: 1, projectSlug: "p-1", title: "Projeto", url: "u", tags: [], description: "D", client: { username: "joao" }, clientSignals: {} }; },
    async getBidContext() { return { projectId: 1, projectSlug: "p-1", minimumOfferCents: 5000, userCanBid: true, connectionsCost: 1, flags: { supportsPromote: true } }; },
  },
  proposalsAdapter: overrides.proposalsAdapter ?? { async send() { return { ok: true, projectId: 1, responseStatusId: 1, directResult: false, connectionsSpent: 1 }; } },
  inboxAdapter: overrides.inboxAdapter ?? {
    async listConversations() { return [{ conversationId: 11, title: "Chat", unreadCount: 2 }]; },
    async getMessages() { return [{ messageId: 99, text: "olá" }]; },
    async sendMessage() { return { ok: true, conversationId: 11 }; },
    async getThread() { return { conversation: { conversationId: 11 }, messages: [{ messageId: 99, text: "olá" }], counts: { inbox: 2 } }; },
    async getDirectoryCounts() { return { inbox: 2 }; },
  },
  accountAdapter: overrides.accountAdapter ?? {
    async getConnections() { return { connections: 12 }; },
    async getDashboardSummary() { return { isLoggedIn: true, connections: 12, isSubscriber: false }; },
    async getSubscriptionStatus() { return { isLoggedIn: true, isSubscriber: false, source: "subscriptions-page" }; },
  },
  profileAdapter: overrides.profileAdapter ?? {
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
  proposalsDailyLimit: 99,
  proposalDayCounter: new Map(),
});

test("mock soak stays stable over repeated rounds", async () => {
  const { createServer } = require("../dist/server/createServer.js");
  const server = createServer(createMockContext());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "soak-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  for (let round = 0; round < 20; round++) {
    const session = parseToolText(await client.callTool({ name: "auth_checkSession", arguments: { accountId: `acc_${round % 3}` } }));
    assert.equal(session.session.isAuthenticated, true);
    const projects = parseToolText(await client.callTool({ name: "projects_list", arguments: { accountId: `acc_${round % 3}`, categorySlug: "web-mobile-e-software", page: 1 } }));
    assert.equal(projects.items.length, 1);
    const inbox = parseToolText(await client.callTool({ name: "inbox_getThread", arguments: { accountId: `acc_${round % 3}`, conversationId: 11 } }));
    assert.equal(inbox.conversation.conversationId, 11);
  }

  await client.close();
  await server.close();
});

test("network failure surfaces as tool error without breaking server", async () => {
  const { createServer } = require("../dist/server/createServer.js");
  const ctx = createMockContext({
    accountAdapter: {
      async getConnections() {
        throw new Error("network timeout");
      },
      async getDashboardSummary() {
        throw new Error("network timeout");
      },
      async getSubscriptionStatus() {
        throw new Error("network timeout");
      },
    },
  });
  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "timeout-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const result = await client.callTool({ name: "account_getConnections", arguments: { accountId: "acc_timeout" } });
  assert.equal(result.isError, true);
  const parsed = parseToolText(result);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /network timeout/i);

  await client.close();
  await server.close();
});

test("cookie/session regression preserves account separation", async () => {
  const { createServer } = require("../dist/server/createServer.js");
  const cookiesSeen = [];
  const sessionManager = {
    async requireCookies(accountId = "default") {
      cookiesSeen.push(accountId);
      return [{ name: "sgcn", value: `cookie-${accountId}`, domain: ".99freelas.com.br" }];
    },
    async createOrUpdateSession({ accountId = "default", username }) {
      return { sessionId: `session-${accountId}`, username };
    },
    async checkSession(accountId = "default") {
      return { isAuthenticated: true, cookiesPresent: ["sgcn"], sessionId: `session-${accountId}`, username: `user-${accountId}` };
    },
    async clearSession() {},
  };

  const server = createServer(createMockContext({ sessionManager }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "cookie-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const first = parseToolText(await client.callTool({ name: "account_getConnections", arguments: { accountId: "acc_a" } }));
  const second = parseToolText(await client.callTool({ name: "account_getConnections", arguments: { accountId: "acc_b" } }));
  assert.equal(first.connections, 12);
  assert.equal(second.connections, 12);
  assert.deepEqual(cookiesSeen.sort(), ["acc_a", "acc_b"]);

  await client.close();
  await server.close();
});
