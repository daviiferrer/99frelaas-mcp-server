import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AccountAdapter } from "../adapters/accountAdapter";
import { InboxAdapter } from "../adapters/inboxAdapter";
import { ProfileAdapter } from "../adapters/profileAdapter";
import { ProjectsAdapter } from "../adapters/projectsAdapter";
import { ProposalsAdapter } from "../adapters/proposalsAdapter";
import { getDefaultManualCookiesFile, loadManualCookiesFromFile, parseManualCookies } from "../auth/manualCookies";
import { SessionManager } from "../auth/sessionManager";
import { Cookie, HttpClient } from "../clients/httpClient";
import { AdapterError } from "../domain/errors";
import { createRequestId, elapsedMs, getErrorMeta, logger } from "../security/logger";
import { RateLimiter } from "../security/rateLimiter";
import { AuditLogStore } from "../storage/auditLogStore";
import { CacheStore } from "../storage/cacheStore";
import {
  getProductPrompt,
  listProductPrompts,
  listProductResourceTemplates,
  listProductResources,
  readProductResource,
} from "./productSurface";
import { toolWidgetResourceUri } from "./widgetResources";
import { toolInputJsonSchemas, toolSchemas } from "./toolSchemas";
import { sha256Hex } from "../utils/text";
import {
  getSkillCatalogPage,
  getSkillSelectionGuideMarkdown,
  getSkillStacksResourceMarkdown,
} from "../domain/skillsCatalog";
import { extractAuthenticatedUsernameFromHtml } from "../parsers/authIdentityParser";
import { readResponseText } from "../clients/responseText";
import { localDateKey } from "../utils/time";

type ToolInputName = keyof typeof toolSchemas;

type ScopedServices = {
  httpClient: HttpClient;
  projectsAdapter: ProjectsAdapter;
  proposalsAdapter: ProposalsAdapter;
  inboxAdapter: InboxAdapter;
  accountAdapter: AccountAdapter;
  profileAdapter: ProfileAdapter;
};

export type AppContext = {
  sessionManager: SessionManager;
  httpClient: HttpClient;
  projectsAdapter: ProjectsAdapter;
  proposalsAdapter: ProposalsAdapter;
  inboxAdapter: InboxAdapter;
  accountAdapter: AccountAdapter;
  profileAdapter: ProfileAdapter;
  rateLimiter: RateLimiter;
  cacheStore: CacheStore;
  auditLog: AuditLogStore;
  proposalDayCounter?: Map<string, number>;
};

/* c8 ignore start */
const toolDescriptions: Record<ToolInputName, string> = {
  auth_importCookies:
    "Import authenticated 99Freelas cookies from pasted JSON, inline array, or file. Pass accountId to isolate sessions by account namespace, then call auth_checkSession.",
  auth_checkSession:
    "Check whether encrypted cookies are loaded for a given accountId namespace. Use before authenticated tools and after auth_importCookies.",
  auth_clearSession: "Clear the currently active session for a given accountId namespace.",
  auth_listSessions: "List stored sessions by accountId without exposing raw cookies. Use before clearing sessions or when auditing connected accounts.",
  profile_getInterestCatalog: "List profile interest categories and nested options for a given accountId. Use before profile_update when choosing interestAreaIds.",
  profile_getEditState: "Inspect current profile fields, skills, interest IDs, photo status, and completeness for a given accountId before changing or bidding.",
  skills_getCatalog:
    "Browse the 99Freelas skill catalog in compact pages or filtered slices for validated skillIds and profile planning.",
  skills_getStacks: "Read curated skill stacks grouped by use case before choosing profile skills.",
  skills_getSelectionGuide: "Read the skill selection guide before refining profile skills.",
  profile_update:
    "Update the freelancer profile for a given accountId. Use only after profile_getEditState/profile_getInterestCatalog and validate skillIds against the curated skills catalog resource before sending.",
  projects_listCategories: "List valid project category slugs. Use before projects_list when the user asks for projects by area.",
  projects_list: "List projects by category/page for a given accountId. Use this to discover projectId/projectSlug and watch flags such as isExclusive/isUrgent before details or proposals.",
  projects_listByAvailability:
    "Scan a small, rate-limited set of project pages and split results into openItems and exclusiveItems. Use this before proposals when you need to avoid exclusive/premium-only projects or schedule follow-up for exclusiveUnlockText/exclusiveOpensAt.",
  projects_get:
    "Read project detail page for a given accountId. Use after projects_list to understand scope, metrics, client signals, competitors, and direct profile targets you can pass to profiles_get.",
  projects_getBidContext:
    "Read the bid page for a given accountId before any proposal. Returns minimumOfferCents, userCanBid, requiresSubscriber, connection cost, and flags such as isAlreadyProposed.",
  proposals_send:
    "Send a proposal for a given accountId. Natural flow: auth_checkSession -> account_getDashboardSummary -> projects_getBidContext -> ensure offerCents >= minimumOfferCents and userCanBid=true -> dryRun if uncertain -> send.",
  inbox_listConversations:
    "List inbox conversations for a given accountId. Use start/limit pagination to inspect older history before reading or replying.",
  inbox_getMessages: "Fetch messages from a conversation for a given accountId. Use before replying so the answer matches the client context.",
  inbox_getThread: "Fetch full conversation plus directory counts for a given accountId. Best default before composing a reply.",
  inbox_sendMessage: "Send a message to a conversation for a given accountId. Use after inbox_getThread and avoid duplicate/unsolicited messages.",
  inbox_getDirectoryCounts: "Get inbox directory counts such as unread/inbox/highlighted for a given accountId.",
  notifications_list: "List notifications for a given accountId. Reads do not clear unread state unless markViewed=true is explicitly passed.",
  account_getConnections: "Get available 99Freelas connections for a given accountId before sending proposals.",
  account_getDashboardSummary: "Get login/account summary, connections, and account indicators for a given accountId before proposals.",
  account_getSubscriptionStatus: "Inspect the /subscriptions page to determine whether the account has an active subscription for a given accountId.",
  profiles_get:
    "Read the public contractor profile for a username, including ratings, history, and open projects, using a given accountId context. Feed it with projects_get.client.username or projects_get.competitors[].username when available.",
  system_health: "Check MCP connectivity and session loading for a given accountId namespace.",
};
/* c8 ignore end */

const readOnlyTool = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  openWorldHint: false,
});

const accountWriteTool = (
  title: string,
  destructiveHint: boolean,
  idempotentHint = false,
): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint,
  idempotentHint,
  openWorldHint: false,
});

const outboundWriteTool = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
});

const toolAnnotations: Record<ToolInputName, ToolAnnotations> = {
  auth_importCookies: accountWriteTool("Import 99Freelas cookies", false, true),
  auth_checkSession: readOnlyTool("Check 99Freelas session"),
  auth_clearSession: accountWriteTool("Clear 99Freelas session", true, true),
  auth_listSessions: readOnlyTool("List 99Freelas sessions"),
  profile_getInterestCatalog: readOnlyTool("Get profile interest catalog"),
  profile_getEditState: readOnlyTool("Get profile edit state"),
  skills_getCatalog: readOnlyTool("Search skill catalog"),
  skills_getStacks: readOnlyTool("Get curated skill stacks"),
  skills_getSelectionGuide: readOnlyTool("Get skill selection guide"),
  profile_update: accountWriteTool("Update freelancer profile", true),
  projects_listCategories: readOnlyTool("List project categories"),
  projects_list: readOnlyTool("List projects"),
  projects_listByAvailability: readOnlyTool("List projects by availability"),
  projects_get: readOnlyTool("Get project details"),
  projects_getBidContext: readOnlyTool("Get project bid context"),
  proposals_send: outboundWriteTool("Send proposal"),
  inbox_listConversations: readOnlyTool("List inbox conversations"),
  inbox_getMessages: readOnlyTool("Get inbox messages"),
  inbox_getThread: readOnlyTool("Get inbox thread"),
  inbox_sendMessage: outboundWriteTool("Send inbox message"),
  inbox_getDirectoryCounts: readOnlyTool("Get inbox directory counts"),
  notifications_list: accountWriteTool("List notifications", false),
  account_getConnections: readOnlyTool("Get account connections"),
  account_getDashboardSummary: readOnlyTool("Get dashboard summary"),
  account_getSubscriptionStatus: readOnlyTool("Get subscription status"),
  profiles_get: readOnlyTool("Get public profile"),
  system_health: readOnlyTool("Check system health"),
};

const getToolMeta = (toolName: ToolInputName): Record<string, unknown> | undefined => {
  const resourceUri = toolWidgetResourceUri[toolName];
  if (!resourceUri) return undefined;
  return {
    ui: { resourceUri },
    "openai/outputTemplate": resourceUri,
  };
};

const resolveAccountId = (argsRaw: unknown): string => {
  if (!argsRaw || typeof argsRaw !== "object") return "default";
  const accountId = (argsRaw as { accountId?: unknown }).accountId;
  if (typeof accountId !== "string") return "default";
  const trimmed = accountId.trim();
  if (!trimmed) return "default";
  return trimmed;
};

const resolveAgentId = (argsRaw: unknown): string => {
  if (!argsRaw || typeof argsRaw !== "object") return "system";
  const agentId = (argsRaw as { agentId?: unknown }).agentId;
  if (typeof agentId !== "string") return "system";
  const trimmed = agentId.trim();
  if (!trimmed) return "system";
  return trimmed;
};

const isManualFallbackEnabled = (): boolean => (process.env.ALLOW_MANUAL_COOKIE_FALLBACK ?? "false").toLowerCase() === "true";

type SessionCookieValidation = "authenticated" | "logged_out" | "inconclusive";

const getAuthCookies = async (ctx: AppContext, accountId: string) => {
  try {
    const cookies = await ctx.sessionManager.requireCookies(accountId);
    if (await verifySessionCookies(ctx, accountId, cookies)) {
      return cookies;
    }
    throw new AdapterError(
      "Stored session is no longer valid on 99Freelas. Import fresh cookies with auth_importCookies.",
      "AUTH_REQUIRED",
    );
  } catch {
    if (!isManualFallbackEnabled()) {
      throw new AdapterError(
        "No active authenticated session for this accountId. Import cookies explicitly with auth_importCookies.",
        "AUTH_REQUIRED",
      );
    }
    const fallbackPath = getDefaultManualCookiesFile();
    const cookies = await loadManualCookiesFromFile(fallbackPath);
    await ctx.sessionManager.createOrUpdateSession({ cookies, accountId });
    await ctx.auditLog.append("auth_importCookies.autoFallback", {
      accountId,
      filePath: fallbackPath,
      cookiesStored: cookies.map((cookie) => cookie.name),
    });
    return cookies;
  }
};

const validateSessionProbe = async (scopedHttp: HttpClient, path: string): Promise<SessionCookieValidation> => {
  const response = await scopedHttp.request(path);
  let html = "";
  try {
    html = await readResponseText(response);
  } catch {
    if (response.ok) {
      return "authenticated";
    }
    return response.status === 401 ? "logged_out" : "inconclusive";
  }
  const username = extractAuthenticatedUsernameFromHtml(html);
  const looksLoggedOut = /\/login\b|\/entrar\b|faça login|faca login|entrar na sua conta|login/i.test(html) || /\/login\b|\/entrar\b/i.test(response.url);
  if (username || (!looksLoggedOut && response.ok)) {
    return "authenticated";
  }
  return looksLoggedOut ? "logged_out" : "inconclusive";
};

const verifySessionCookies = async (ctx: AppContext, accountId: string, cookies: Cookie[]): Promise<boolean> => {
  const scopedHttp = ctx.httpClient instanceof HttpClient ? ctx.httpClient.createChildWithCookies(cookies) : ctx.httpClient;
  const probeResults = [
    await validateSessionProbe(scopedHttp, "/dashboard"),
    await validateSessionProbe(scopedHttp, "/profile/edit"),
  ];
  if (probeResults.includes("authenticated")) {
    return true;
  }
  if (!probeResults.includes("inconclusive")) {
    await ctx.sessionManager.clearSession(accountId);
    await ctx.auditLog.append("session.invalidated", { accountId, reason: "logged_out_probe" });
    return false;
  }
  logger.warn("session.verify.inconclusive", { accountId });
  await ctx.auditLog.append("session.verify.inconclusive", { accountId });
  return true;
};

const identifyAuthenticatedUsername = async (httpClient: HttpClient): Promise<string | undefined> => {
  try {
    const response = await httpClient.request("/profile/edit");
    const html = await readResponseText(response);
    return extractAuthenticatedUsernameFromHtml(html);
  } catch (error) {
    logger.warn("auth.identity.resolve.fail", { ...getErrorMeta(error) });
    return undefined;
  }
};

const resolveAuthenticatedUsername = async (httpClient: HttpClient, cookies: ReturnType<typeof parseManualCookies>): Promise<string | undefined> => {
  const candidates: Array<() => HttpClient> = [];
  const maybeCreateChild = (httpClient as { createChildWithCookies?: ((cookies: ReturnType<typeof parseManualCookies>) => HttpClient) | undefined }).createChildWithCookies;
  if (typeof maybeCreateChild === "function") {
    candidates.push(() => maybeCreateChild.call(httpClient, cookies));
  }
  if (typeof (httpClient as { request?: unknown }).request === "function" && typeof (httpClient as { setCookies?: unknown }).setCookies === "function") {
    candidates.push(() => httpClient);
  }

  for (const candidate of candidates) {
    try {
      const username = await identifyAuthenticatedUsername(candidate());
      if (username) return username;
    } catch (error) {
      logger.warn("auth.identity.resolve.fail", { ...getErrorMeta(error) });
    }
  }
  return undefined;
};

const getScopedServices = async (ctx: AppContext, accountId: string): Promise<ScopedServices> => {
  const cookies = await getAuthCookies(ctx, accountId);
  if (!(ctx.httpClient instanceof HttpClient)) {
    return {
      httpClient: ctx.httpClient,
      projectsAdapter: ctx.projectsAdapter,
      proposalsAdapter: ctx.proposalsAdapter,
      inboxAdapter: ctx.inboxAdapter,
      accountAdapter: ctx.accountAdapter,
      profileAdapter: ctx.profileAdapter,
    };
  }
  const scopedHttpClient = ctx.httpClient.createChildWithCookies(cookies);
  return {
    httpClient: scopedHttpClient,
    projectsAdapter: new ProjectsAdapter(scopedHttpClient),
    proposalsAdapter: new ProposalsAdapter(scopedHttpClient),
    inboxAdapter: new InboxAdapter(scopedHttpClient),
    accountAdapter: new AccountAdapter(scopedHttpClient),
    profileAdapter: new ProfileAdapter(scopedHttpClient),
  };
};

const asStructuredContent = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
};

const asToolOutput = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: asStructuredContent(value),
  isError,
});

type ProposalDailyCounterStore = CacheStore & {
  getDailyProposalCount?: (dayKey: string, accountId?: string) => Promise<number>;
  incrementDailyProposalCount?: (dayKey: string, accountId?: string) => Promise<number>;
};

const proposalCounterKey = (accountId: string, dayKey: string): string => `${accountId}:${dayKey}:proposals`;

const getDailyProposalCount = async (ctx: AppContext, accountId: string, dayKey: string): Promise<number> => {
  const store = ctx.cacheStore as ProposalDailyCounterStore;
  if (typeof store.getDailyProposalCount === "function") {
    return store.getDailyProposalCount(dayKey, accountId);
  }
  return ctx.proposalDayCounter?.get(proposalCounterKey(accountId, dayKey)) ?? 0;
};

const incrementDailyProposalCount = async (
  ctx: AppContext,
  accountId: string,
  dayKey: string,
  fallbackCurrentCount: number,
): Promise<void> => {
  const store = ctx.cacheStore as ProposalDailyCounterStore;
  if (typeof store.incrementDailyProposalCount === "function") {
    await store.incrementDailyProposalCount(dayKey, accountId);
    return;
  }
  ctx.proposalDayCounter?.set(proposalCounterKey(accountId, dayKey), fallbackCurrentCount + 1);
};

const executeTool = async (
  ctx: AppContext,
  toolName: ToolInputName,
  argsRaw: unknown,
): Promise<unknown> => {
  const accountId = resolveAccountId(argsRaw);
  const agentId = resolveAgentId(argsRaw);
  logger.info("tool.call", { toolName, accountId, agentId });
  await ctx.rateLimiter.consume(`${accountId}:${toolName}`);

  switch (toolName) {
    case "auth_importCookies": {
      const args = toolSchemas[toolName].parse(argsRaw);
      const cookies = args.cookiesJson
        ? parseManualCookies(JSON.parse(args.cookiesJson))
        : args.cookies
          ? parseManualCookies(args.cookies)
          : await loadManualCookiesFromFile(args.filePath);
      let username: string | undefined;
      let userId: string | undefined;
      username = await resolveAuthenticatedUsername(ctx.httpClient, cookies);
      const saved = await ctx.sessionManager.createOrUpdateSession({
        accountId,
        cookies,
        username,
        userId,
      });
      logger.info("tool.result", { toolName, accountId, ok: true, sessionId: saved.sessionId });
      await ctx.auditLog.append("auth_importCookies", {
        accountId,
        agentId,
        sessionId: saved.sessionId,
        username,
        source: args.cookiesJson
          ? "inline-json"
          : args.cookies
            ? "inline-array"
            : args.filePath ?? getDefaultManualCookiesFile(),
        cookiesStored: cookies.map((c) => c.name),
      });
      return {
        ok: true,
        sessionId: saved.sessionId,
        username,
        cookiesStored: cookies.map((c) => c.name),
      };
    }
    case "auth_checkSession": {
      const state = await ctx.sessionManager.checkSession(accountId);
      if (!state.isAuthenticated || state.cookiesPresent.length === 0) {
        return { ok: true, session: state, verified: false };
      }
      const cookies = await ctx.sessionManager.requireCookies(accountId);
      const alive = await verifySessionCookies(ctx, accountId, cookies);
      const refreshed = await ctx.sessionManager.checkSession(accountId);
      return { ok: true, session: refreshed, verified: alive };
    }
    case "auth_clearSession": {
      await ctx.sessionManager.clearSession(accountId);
      await ctx.auditLog.append("auth_clearSession", { accountId });
      return { ok: true };
    }
    case "auth_listSessions": {
      return { items: await ctx.sessionManager.listSessions() };
    }
    case "profile_getInterestCatalog": {
      const scoped = await getScopedServices(ctx, accountId);
      return { items: await scoped.profileAdapter.getInterestCatalog() };
    }
    case "profile_getEditState": {
      const scoped = await getScopedServices(ctx, accountId);
      return scoped.profileAdapter.getEditState();
    }
    case "skills_getCatalog": {
      const args = toolSchemas[toolName].parse(argsRaw);
      const result = getSkillCatalogPage(args);
      return {
        ...result,
        items: result.items,
      };
    }
    case "skills_getStacks": {
      return { markdown: getSkillStacksResourceMarkdown() };
    }
    case "skills_getSelectionGuide": {
      return { markdown: getSkillSelectionGuideMarkdown() };
    }
    case "profile_update": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      const result = await scoped.profileAdapter.update(args);
      logger.info("tool.result", { toolName, accountId, ok: true });
      await ctx.auditLog.append("profile_update", {
        accountId,
        agentId,
        nickname: args.nickname,
        titleLength: args.professionalTitle.length,
      });
      return result;
    }
    case "projects_listCategories": {
      return { items: ctx.projectsAdapter.listCategories() };
    }
    case "projects_list": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      const result = await scoped.projectsAdapter.list(args);
      return result;
    }
    case "projects_listByAvailability": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.projectsAdapter.listByAvailability(args);
    }
    case "projects_get": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.projectsAdapter.get(args);
    }
    case "projects_getBidContext": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.projectsAdapter.getBidContext(args);
    }
    case "proposals_send": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      let sentToday = 0;
      let day: string | undefined;
      if (args.proposalsDailyLimit !== undefined) {
        day = localDateKey(new Date(), args.operationTimeZone);
        sentToday = await getDailyProposalCount(ctx, accountId, day);
        if (sentToday >= args.proposalsDailyLimit) {
          throw new AdapterError("Daily proposals limit reached", "PROPOSALS_DAILY_LIMIT");
        }
      }
      if (!args.dryRun && (await ctx.cacheStore.hasProposal(args.projectId, accountId))) {
        throw new AdapterError("Duplicate proposal blocked", "PROPOSAL_DUPLICATE");
      }
      const bidContext = args.projectSlug
        ? await scoped.projectsAdapter.getBidContext({ projectId: args.projectId, projectSlug: args.projectSlug })
        : undefined;
      if (!args.dryRun && bidContext?.userCanBid === false) {
        throw new AdapterError("Project is not currently eligible for this account", "PROJECT_NOT_ELIGIBLE");
      }
      if (!args.dryRun && bidContext?.minimumOfferCents && args.offerCents < bidContext.minimumOfferCents) {
        throw new AdapterError(
          `Offer below project minimum. Use offerCents >= ${bidContext.minimumOfferCents}`,
          "MINIMUM_OFFER",
        );
      }
      const result = await scoped.proposalsAdapter.send(args);
      if (!args.dryRun && result.ok) {
        await ctx.cacheStore.markProposal(args.projectId, accountId);
        if (day !== undefined) {
          await incrementDailyProposalCount(ctx, accountId, day, sentToday);
        }
      }
      logger.info("tool.result", { toolName, accountId, ok: result.ok, projectId: args.projectId, dryRun: args.dryRun });
      await ctx.auditLog.append("proposals_send", {
        accountId,
        agentId,
        projectId: args.projectId,
        dryRun: args.dryRun,
      });
      return {
        ...result,
        bidContext,
        connectionsSpent: args.dryRun || !result.ok ? 0 : 1,
      };
    }
    case "inbox_listConversations": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.inboxAdapter.listConversations(args);
    }
    case "inbox_getMessages": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return { items: await scoped.inboxAdapter.getMessages(args) };
    }
    case "inbox_getThread": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.inboxAdapter.getThread(args);
    }
    case "inbox_sendMessage": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      const msgHash = sha256Hex(`${args.conversationId}::${args.text}`);
      if (await ctx.cacheStore.hasMessageHash(msgHash, accountId)) {
        throw new AdapterError("Duplicate message blocked", "MESSAGE_DUPLICATE");
      }
      const result = await scoped.inboxAdapter.sendMessage(args);
      if (result.ok) {
        await ctx.cacheStore.markMessageHash(msgHash, accountId);
      }
      logger.info("tool.result", { toolName, accountId, ok: result.ok, conversationId: args.conversationId });
      return result;
    }
    case "inbox_getDirectoryCounts": {
      const scoped = await getScopedServices(ctx, accountId);
      return { counts: await scoped.inboxAdapter.getDirectoryCounts() };
    }
    case "notifications_list": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.inboxAdapter.listNotifications(args);
    }
    case "account_getConnections": {
      const scoped = await getScopedServices(ctx, accountId);
      return scoped.accountAdapter.getConnections();
    }
    case "account_getDashboardSummary": {
      const scoped = await getScopedServices(ctx, accountId);
      return scoped.accountAdapter.getDashboardSummary();
    }
    case "account_getSubscriptionStatus": {
      const scoped = await getScopedServices(ctx, accountId);
      return scoped.accountAdapter.getSubscriptionStatus();
    }
    case "profiles_get": {
      const scoped = await getScopedServices(ctx, accountId);
      const args = toolSchemas[toolName].parse(argsRaw);
      return scoped.profileAdapter.getPublicProfile(args);
    }
    case "system_health": {
      const session = await ctx.sessionManager.checkSession(accountId);
      let connectivity = false;
      try {
        const http = session.cookiesPresent.length > 0 ? (await getScopedServices(ctx, accountId)).httpClient : ctx.httpClient;
        const res = await http.request("/");
        connectivity = res.ok;
      } catch {
        connectivity = false;
      }
      return {
        ok: true,
        session,
        cookiesLoaded: session.cookiesPresent.length > 0,
        connectivity,
        lastValidatedAt: session.lastValidatedAt,
  };
    }
    /* c8 ignore next 2 */
    default:
      throw new AdapterError(`Unknown tool: ${toolName}`);
  }
};

const parseToolArgs = <T extends ToolInputName>(name: T, argsRaw: unknown): z.infer<(typeof toolSchemas)[T]> =>
  toolSchemas[name].parse(argsRaw);

export const createServer = (ctx: AppContext): Server => {
  const server = new Server(
    {
      name: "99freelas-mcp-server",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
      instructions:
        "Private/local 99Freelas adapter. Use read-only discovery before posting or sending. Keep agent orchestration in the consuming app and keep authenticated cookies encrypted at rest.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (Object.keys(toolSchemas) as ToolInputName[]).map((name) => ({
      name,
      description: toolDescriptions[name],
      inputSchema: toolInputJsonSchemas[name],
      annotations: toolAnnotations[name],
      _meta: getToolMeta(name),
    })),
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => listProductPrompts());
  server.setRequestHandler(GetPromptRequestSchema, async (request) => getProductPrompt(request.params.name, request.params.arguments));
  server.setRequestHandler(ListResourcesRequestSchema, async () => listProductResources());
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: listProductResourceTemplates().resourceTemplates }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => readProductResource(request.params.uri));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name as ToolInputName;
    const requestId = createRequestId();
    const startedAt = Date.now();
    if (!(toolName in toolSchemas)) {
      logger.warn("tool.unknown", { toolName, requestId });
      return asToolOutput({ ok: false, error: "Unknown tool" }, true);
    }

    try {
      logger.debug("tool.parse.start", { toolName, requestId });
      parseToolArgs(toolName, request.params.arguments ?? {});
      logger.debug("tool.parse.ok", { toolName, requestId });
      const result = await executeTool(ctx, toolName, request.params.arguments ?? {});
      logger.info("tool.complete", { toolName, requestId, ok: true, durationMs: elapsedMs(startedAt) });
      return asToolOutput(result);
    } catch (error) {
      const err = error as Error;
      const errorCode = (error as { code?: string }).code ?? "UNKNOWN";
      logger.error("tool.error", {
        toolName,
        requestId,
        durationMs: elapsedMs(startedAt),
        errorCode,
        ...getErrorMeta(error),
      });
      await ctx.auditLog.append("tool.error", {
        toolName,
        requestId,
        message: err.message,
      });
      return asToolOutput(
        {
          ok: false,
          error: err.message,
          code: errorCode,
          requestId,
        },
        true,
      );
    }
  });

  return server;
};

export const startStdioServer = async (server: Server): Promise<void> => {
  logger.info("server.start", { transport: "stdio", pid: process.pid });
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
