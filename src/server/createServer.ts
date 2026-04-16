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
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AccountAdapter } from "../adapters/accountAdapter";
import { InboxAdapter } from "../adapters/inboxAdapter";
import { ProfileAdapter } from "../adapters/profileAdapter";
import { ProjectsAdapter } from "../adapters/projectsAdapter";
import { ProposalsAdapter } from "../adapters/proposalsAdapter";
import { getDefaultManualCookiesFile, loadManualCookiesFromFile, parseManualCookies } from "../auth/manualCookies";
import { SessionManager } from "../auth/sessionManager";
import { HttpClient } from "../clients/httpClient";
import { AdapterError } from "../domain/errors";
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
import { toolInputJsonSchemas, toolSchemas } from "./toolSchemas";
import { sha256Hex } from "../utils/text";
import {
  getSkillCatalogPage,
  getSkillSelectionGuideMarkdown,
  getSkillStacksResourceMarkdown,
} from "../domain/skillsCatalog";

type ToolInputName = keyof typeof toolSchemas;

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
  proposalsDailyLimit: number;
  proposalDayCounter: Map<string, number>;
};

/* c8 ignore start */
const toolDescriptions: Record<ToolInputName, string> = {
  auth_importCookies:
    "Import authenticated 99Freelas cookies from pasted JSON, inline array, or file. Use first when the session is missing; then call auth_checkSession.",
  auth_checkSession:
    "Check whether encrypted cookies are loaded. Use before authenticated tools and after auth_importCookies.",
  auth_clearSession: "Clear the currently active session.",
  profile_getInterestCatalog: "List profile interest categories and nested options. Use before profile_update when choosing interestAreaIds.",
  profile_getEditState: "Inspect current profile fields, skills, interest IDs, photo status, and completeness before changing or bidding.",
  skills_getCatalog:
    "Browse the 99Freelas skill catalog in compact pages or filtered slices for validated skillIds and profile planning.",
  skills_getStacks: "Read curated skill stacks grouped by use case before choosing profile skills.",
  skills_getSelectionGuide: "Read the skill selection guide before refining profile skills.",
  profile_update:
    "Update the freelancer profile. Use only after profile_getEditState/profile_getInterestCatalog and validate skillIds against the curated skills catalog resource before sending.",
  projects_listCategories: "List valid project category slugs. Use before projects_list when the user asks for projects by area.",
  projects_list: "List projects by category/page. Use this to discover projectId/projectSlug and watch flags such as isExclusive/isUrgent before details or proposals.",
  projects_listByAvailability:
    "Scan a small, rate-limited set of project pages and split results into openItems and exclusiveItems. Use this before proposals when you need to avoid exclusive/premium-only projects or schedule follow-up for exclusiveUnlockText/exclusiveOpensAt.",
  projects_get: "Read project detail page. Use after projects_list to understand scope, client signals, competitors, and bid URL.",
  projects_getBidContext:
    "Read the bid page before any proposal. Returns minimumOfferCents, userCanBid, requiresSubscriber, connection cost, and flags such as isAlreadyProposed.",
  proposals_send:
    "Send a proposal. Natural flow: auth_checkSession -> account_getDashboardSummary -> projects_getBidContext -> ensure offerCents >= minimumOfferCents and userCanBid=true -> dryRun if uncertain -> send.",
  inbox_listConversations: "List inbox conversations. Use to discover conversationId before reading or replying.",
  inbox_getMessages: "Fetch messages from a conversation. Use before replying so the answer matches the client context.",
  inbox_getThread: "Fetch full conversation plus directory counts. Best default before composing a reply.",
  inbox_sendMessage: "Send a message to a conversation. Use after inbox_getThread and avoid duplicate/unsolicited messages.",
  inbox_getDirectoryCounts: "Get inbox directory counts such as unread/inbox/highlighted.",
  account_getConnections: "Get available 99Freelas connections before sending proposals.",
  account_getDashboardSummary: "Get login/account summary, connections, and account indicators before proposals.",
  account_getSubscriptionStatus: "Inspect the /subscriptions page to determine whether the account has an active subscription.",
  profiles_get: "Read the public contractor profile for a project owner, including ratings, history, and open projects.",
  system_health: "Check MCP connectivity, session loading, and basic service health.",
};
/* c8 ignore end */

const ensureAuth = async (ctx: AppContext): Promise<void> => {
  try {
    const cookies = await ctx.sessionManager.requireCookies();
    ctx.httpClient.setCookies(cookies);
  } catch {
    const fallbackPath = getDefaultManualCookiesFile();
    const cookies = await loadManualCookiesFromFile(fallbackPath);
    await ctx.sessionManager.createOrUpdateSession({ cookies });
    ctx.httpClient.setCookies(cookies);
    await ctx.auditLog.append("auth_importCookies.autoFallback", {
      filePath: fallbackPath,
      cookiesStored: cookies.map((cookie) => cookie.name),
    });
  }
};

const asToolOutput = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  isError,
});

const executeTool = async (
  ctx: AppContext,
  toolName: ToolInputName,
  argsRaw: unknown,
): Promise<unknown> => {
  ctx.rateLimiter.consume(toolName);

  switch (toolName) {
    case "auth_importCookies": {
      const args = toolSchemas[toolName].parse(argsRaw);
      const cookies = args.cookiesJson
        ? parseManualCookies(JSON.parse(args.cookiesJson))
        : args.cookies
          ? parseManualCookies(args.cookies)
          : await loadManualCookiesFromFile(args.filePath);
      const saved = await ctx.sessionManager.createOrUpdateSession({
        cookies,
      });
      ctx.httpClient.setCookies(cookies);
      await ctx.auditLog.append("auth_importCookies", {
        sessionId: saved.sessionId,
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
        cookiesStored: cookies.map((c) => c.name),
      };
    }
    case "auth_checkSession": {
      const state = await ctx.sessionManager.checkSession();
      return { ok: true, session: state };
    }
    case "auth_clearSession": {
      await ctx.sessionManager.clearSession();
      await ctx.auditLog.append("auth_clearSession");
      return { ok: true };
    }
    case "profile_getInterestCatalog": {
      await ensureAuth(ctx);
      return { items: await ctx.profileAdapter.getInterestCatalog() };
    }
    case "profile_getEditState": {
      await ensureAuth(ctx);
      return ctx.profileAdapter.getEditState();
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
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      const result = await ctx.profileAdapter.update(args);
      await ctx.auditLog.append("profile_update", {
        nickname: args.nickname,
        titleLength: args.professionalTitle.length,
      });
      return result;
    }
    case "projects_listCategories": {
      return { items: ctx.projectsAdapter.listCategories() };
    }
    case "projects_list": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      const result = await ctx.projectsAdapter.list(args);
      return result;
    }
    case "projects_listByAvailability": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      return ctx.projectsAdapter.listByAvailability(args);
    }
    case "projects_get": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      return ctx.projectsAdapter.get(args);
    }
    case "projects_getBidContext": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      return ctx.projectsAdapter.getBidContext(args);
    }
    case "proposals_send": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      const day = new Date().toISOString().slice(0, 10);
      const sentToday = ctx.proposalDayCounter.get(day) ?? 0;
      if (sentToday >= ctx.proposalsDailyLimit) {
        throw new AdapterError("Daily proposals limit reached", "PROPOSALS_DAILY_LIMIT");
      }
      if (!args.dryRun && (await ctx.cacheStore.hasProposal(args.projectId))) {
        throw new AdapterError("Duplicate proposal blocked", "PROPOSAL_DUPLICATE");
      }
      const bidContext = args.projectSlug
        ? await ctx.projectsAdapter.getBidContext({ projectId: args.projectId, projectSlug: args.projectSlug })
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
      const result = await ctx.proposalsAdapter.send(args);
      if (!args.dryRun && result.ok) {
        await ctx.cacheStore.markProposal(args.projectId);
        ctx.proposalDayCounter.set(day, sentToday + 1);
      }
      await ctx.auditLog.append("proposals_send", {
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
      await ensureAuth(ctx);
      return { items: await ctx.inboxAdapter.listConversations() };
    }
    case "inbox_getMessages": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      return { items: await ctx.inboxAdapter.getMessages(args) };
    }
    case "inbox_getThread": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      return ctx.inboxAdapter.getThread(args);
    }
    case "inbox_sendMessage": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      const msgHash = sha256Hex(`${args.conversationId}::${args.text}`);
      if (await ctx.cacheStore.hasMessageHash(msgHash)) {
        throw new AdapterError("Duplicate message blocked", "MESSAGE_DUPLICATE");
      }
      const result = await ctx.inboxAdapter.sendMessage(args);
      if (result.ok) {
        await ctx.cacheStore.markMessageHash(msgHash);
      }
      return result;
    }
    case "inbox_getDirectoryCounts": {
      await ensureAuth(ctx);
      return { counts: await ctx.inboxAdapter.getDirectoryCounts() };
    }
    case "account_getConnections": {
      await ensureAuth(ctx);
      return ctx.accountAdapter.getConnections();
    }
    case "account_getDashboardSummary": {
      await ensureAuth(ctx);
      return ctx.accountAdapter.getDashboardSummary();
    }
    case "account_getSubscriptionStatus": {
      await ensureAuth(ctx);
      return ctx.accountAdapter.getSubscriptionStatus();
    }
    case "profiles_get": {
      await ensureAuth(ctx);
      const args = toolSchemas[toolName].parse(argsRaw);
      return ctx.profileAdapter.getPublicProfile(args);
    }
    case "system_health": {
      const session = await ctx.sessionManager.checkSession();
      let connectivity = false;
      try {
        const res = await ctx.httpClient.request("/");
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
      version: "0.1.0",
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
    })),
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => listProductPrompts());
  server.setRequestHandler(GetPromptRequestSchema, async (request) => getProductPrompt(request.params.name, request.params.arguments));
  server.setRequestHandler(ListResourcesRequestSchema, async () => listProductResources());
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: listProductResourceTemplates().resourceTemplates }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => readProductResource(request.params.uri));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name as ToolInputName;
    if (!(toolName in toolSchemas)) {
      return asToolOutput({ ok: false, error: "Unknown tool" }, true);
    }

    try {
      parseToolArgs(toolName, request.params.arguments ?? {});
      const result = await executeTool(ctx, toolName, request.params.arguments ?? {});
      return asToolOutput(result);
    } catch (error) {
      const err = error as Error;
      await ctx.auditLog.append("tool.error", {
        toolName,
        message: err.message,
      });
      return asToolOutput(
        {
          ok: false,
          error: err.message,
          code: (error as { code?: string }).code ?? "UNKNOWN",
        },
        true,
      );
    }
  });

  return server;
};

export const startStdioServer = async (server: Server): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
