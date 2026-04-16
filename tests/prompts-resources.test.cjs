const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");

const parseText = (result) => JSON.parse(result.content[0].text);
const responseText = (text, url = "https://www.99freelas.com.br/x", ok = true) => ({
  ok,
  url,
  headers: { get: () => "text/html; charset=utf-8" },
  arrayBuffer: async () => new TextEncoder().encode(text).buffer,
});

test("prompts and resources are exposed", async () => {
  const { createServer } = require("../dist/server/createServer.js");

  const ctx = {
    sessionManager: {
      async requireCookies() {
        return [{ name: "JSESSIONID", value: "x", domain: ".99freelas.com.br" }];
      },
      async createOrUpdateSession() {
        return { sessionId: "sess_01" };
      },
      async checkSession() {
        return { isAuthenticated: true, cookiesPresent: ["JSESSIONID"], sessionId: "sess_01" };
      },
      async clearSession() {},
    },
    httpClient: {
      setCookies() {},
      async request() {
        return responseText("ok");
      },
    },
    projectsAdapter: { listCategories() { return []; }, async list() { return { items: [], page: 1, hasMore: false }; }, async listByAvailability() { return { openItems: [], exclusiveItems: [], pagesScanned: 0, rateLimitNote: "" }; }, async get() { return {}; }, async getBidContext() { return {}; } },
    proposalsAdapter: { async send() { return { ok: true, projectId: 1 }; } },
    inboxAdapter: { async listConversations() { return []; }, async getMessages() { return []; }, async sendMessage() { return { ok: true }; }, async getThread() { return { conversation: {}, messages: [], counts: {} }; }, async getDirectoryCounts() { return {}; } },
    accountAdapter: { async getConnections() { return { connections: 1 }; }, async getDashboardSummary() { return { isLoggedIn: true, connections: 1, isSubscriber: false }; }, async getSubscriptionStatus() { return { isLoggedIn: true, isSubscriber: false, source: "subscriptions-page" }; } },
    profileAdapter: { async getInterestCatalog() { return []; }, async getEditState() { return { interestAreaIds: [], skillIds: [], photoPresent: true }; }, async update() { return { ok: true }; }, async getPublicProfile() { return { profileUrl: "https://www.99freelas.com.br/user/x" }; } },
    rateLimiter: { consume() {} },
    cacheStore: { async hasProposal() { return false; }, async markProposal() {}, async hasMessageHash() { return false; }, async markMessageHash() {} },
    auditLog: { async append() {} },
    proposalsDailyLimit: 1,
    proposalDayCounter: new Map(),
  };

  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "prompt-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const prompts = await client.listPrompts();
  assert.equal(prompts.prompts.length >= 4, true);
  assert.equal(prompts.prompts.some((prompt) => prompt.name === "analyze_project"), true);

  const prompt = await client.getPrompt({ name: "analyze_project", arguments: { projectId: "744452", projectSlug: "abc-744452" } });
  assert.equal(prompt.messages[0].role, "user");
  assert.match(prompt.messages[0].content.text, /projects_get/);
  assert.match(prompt.messages[0].content.text, /projects_getBidContext/);

  const proposalPrompt = await client.getPrompt({ name: "draft_proposal", arguments: { projectId: "744452", projectSlug: "abc-744452", offerCents: "120000", durationDays: "15" } });
  assert.match(proposalPrompt.messages[0].content.text, /minimumOfferCents/);

  const inboxPrompt = await client.getPrompt({ name: "reply_inbox", arguments: { conversationId: "16352833" } });
  assert.match(inboxPrompt.messages[0].content.text, /inbox_getThread/);

  const monitorPrompt = await client.getPrompt({ name: "monitor_account", arguments: { watchWindow: "daily" } });
  assert.match(monitorPrompt.messages[0].content.text, /system_health/);

  const bareMonitorPrompt = await client.getPrompt({ name: "monitor_account" });
  assert.match(bareMonitorPrompt.messages[0].content.text, /Prompt: monitor_account/);

  const refinePrompt = await client.getPrompt({ name: "refine_profile_skills", arguments: { targetRole: "dev", focusStack: "backend-api" } });
  assert.match(refinePrompt.messages[0].content.text, /compact catalog slice/);

  const policyPrompt = await client.getPrompt({ name: "review_99freelas_policies" });
  assert.match(policyPrompt.messages[0].content.text, /policy summary/);

  const resources = await client.listResources();
  assert.equal(resources.resources.length >= 7, true);
  assert.equal(resources.resources.some((resource) => resource.uri === "resource://99freelas/server-manifest"), true);

  const resourceTemplates = await client.listResourceTemplates();
  assert.equal(resourceTemplates.resourceTemplates.some((template) => template.uriTemplate === "resource://99freelas/skills-catalog/page/{offset}"), true);
  assert.equal(resourceTemplates.resourceTemplates.some((template) => template.uriTemplate === "resource://99freelas/skills-catalog/search/{query}"), true);

  const manifest = await client.readResource({ uri: "resource://99freelas/server-manifest" });
  assert.equal(manifest.contents[0].mimeType, "application/json");
  assert.match(manifest.contents[0].text, /skillStackKeys/);
  const toolCatalog = await client.readResource({ uri: "resource://99freelas/tool-catalog" });
  assert.equal(toolCatalog.contents[0].mimeType, "text/markdown");
  assert.match(toolCatalog.contents[0].text, /Tool Catalog/);
  assert.match(toolCatalog.contents[0].text, /skills_getCatalog/);
  const skillsCatalog = await client.readResource({ uri: "resource://99freelas/skills-catalog" });
  assert.equal(skillsCatalog.contents[0].mimeType, "application/json");
  assert.match(skillsCatalog.contents[0].text, /curatedStacks/);
  const skillsStacks = await client.readResource({ uri: "resource://99freelas/skills-stacks" });
  assert.equal(skillsStacks.contents[0].mimeType, "text/markdown");
  assert.match(skillsStacks.contents[0].text, /Curated Skill Stacks/);
  const skillsGuide = await client.readResource({ uri: "resource://99freelas/skills-selection-guide" });
  assert.equal(skillsGuide.contents[0].mimeType, "text/markdown");
  assert.match(skillsGuide.contents[0].text, /Skill Selection Guide/);
  const policiesSummary = await client.readResource({ uri: "resource://99freelas/policies-summary" });
  assert.equal(policiesSummary.contents[0].mimeType, "application/json");
  assert.match(policiesSummary.contents[0].text, /forbiddenActions/);
  const promptCatalog = await client.readResource({ uri: "resource://99freelas/prompt-catalog" });
  assert.equal(promptCatalog.contents[0].mimeType, "application/json");
  const quickstart = await client.readResource({ uri: "resource://99freelas/quickstart" });
  assert.equal(quickstart.contents[0].mimeType, "text/markdown");
  assert.match(quickstart.contents[0].text, /Quickstart/);
  const skillsPage = await client.readResource({ uri: "resource://99freelas/skills-catalog/page/0" });
  assert.equal(skillsPage.contents[0].mimeType, "application/json");
  assert.match(skillsPage.contents[0].text, /Compact page/);
  const skillsSearch = await client.readResource({ uri: "resource://99freelas/skills-catalog/search/docker" });
  assert.equal(skillsSearch.contents[0].mimeType, "application/json");
  assert.match(skillsSearch.contents[0].text, /Docker/);
  await assert.rejects(
    () => client.readResource({ uri: "resource://99freelas/skills-catalog/page/-1" }),
    /Unknown resource/,
  );

  await assert.rejects(() => client.getPrompt({ name: "missing_prompt", arguments: {} }), /Unknown prompt/);
  await assert.rejects(() => client.readResource({ uri: "resource://99freelas/unknown" }), /Unknown resource/);

  await client.close();
  await server.close();
});
