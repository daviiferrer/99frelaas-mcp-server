import type {
  GetPromptResult,
  ListPromptsResult,
  ListResourceTemplatesResult,
  ListResourcesResult,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getCuratedSkillStacks,
  getSkillCatalogIndexResourceJson,
  getSkillCatalogPageResourceJson,
  getSkillSelectionGuideMarkdown,
  getSkillStacksResourceMarkdown,
} from "../domain/skillsCatalog";
import {
  getWidgetResourceHtml,
  getWidgetResourceMimeType,
  isWidgetResourceUri,
  listWidgetResources,
} from "./widgetResources";

const BASE_URL = process.env.NINETY_NINE_BASE_URL ?? "https://www.99freelas.com.br";

type PromptName =
  | "screen_projects_for_fit"
  | "analyze_project"
  | "draft_proposal"
  | "reply_inbox"
  | "monitor_account"
  | "auth_listSessions"
  | "refine_profile_skills"
  | "review_99freelas_policies";

const promptCatalog: Array<
  Prompt & {
    name: PromptName;
  }
> = [
  {
    name: "screen_projects_for_fit",
    description:
      "Screen recent projects against a target profile before opening detailed project pages.",
    arguments: [
      {
        name: "targetProfile",
        description: "Short summary of the freelancer profile, stack, niche, and ideal client.",
        required: true,
      },
      {
        name: "categorySlug",
        description: "Category slug to scan first, such as web-mobile-e-software or vendas-e-marketing.",
        required: true,
      },
    ],
  },
  {
    name: "analyze_project",
    description:
      "Analyze a 99Freelas project end-to-end and decide whether it is worth bidding on.",
    arguments: [
      {
        name: "projectId",
        description: "Numeric project ID to analyze.",
        required: true,
      },
      {
        name: "projectSlug",
        description: "Project slug used in the public project URL.",
        required: true,
      },
    ],
  },
  {
    name: "draft_proposal",
    description:
      "Prepare a proposal after checking bid context, minimum offer, and eligibility.",
    arguments: [
      {
        name: "projectId",
        description: "Numeric project ID to bid on.",
        required: true,
      },
      {
        name: "projectSlug",
        description: "Project slug used in the bid URL.",
        required: true,
      },
      {
        name: "offerCents",
        description: "Offer amount in cents.",
        required: true,
      },
      {
        name: "durationDays",
        description: "Estimated delivery time in days.",
        required: true,
      },
    ],
  },
  {
    name: "reply_inbox",
    description:
      "Compose a contextual reply after reading the full inbox thread for a client.",
    arguments: [
      {
        name: "conversationId",
        description: "Conversation ID to inspect before replying.",
        required: true,
      },
    ],
  },
  {
    name: "monitor_account",
    description:
      "Check session, inbox counts, subscription status, and recent project activity in one flow.",
    arguments: [
      {
        name: "watchWindow",
        description: "Optional monitoring window label for the agent loop.",
        required: false,
      },
    ],
  },
  {
    name: "auth_listSessions",
    description:
      "Inspect stored sessions by account and audit connected accounts without exposing raw cookies.",
    arguments: [],
  },
  {
    name: "refine_profile_skills",
    description:
      "Choose validated profile skills from curated stacks first, then query a compact catalog slice only for the exact skillIds you need before calling profile_update.",
    arguments: [
      {
        name: "targetRole",
        description: "Desired positioning such as dev, frontend, backend, qa, mobile, cloud, or marketing.",
        required: false,
      },
      {
        name: "focusStack",
        description: "Optional curated stack key to start from, like backend-api or frontend-ui.",
        required: false,
      },
    ],
  },
  {
    name: "review_99freelas_policies",
    description:
      "Read the platform safety policy summary before proposing, replying, or updating profile data.",
    arguments: [],
  },
];

const resourceCatalog: Resource[] = [
  {
    uri: "resource://99freelas/server-manifest",
    name: "server-manifest",
    description: "Server manifest with capabilities, environment variables, and safety notes.",
    mimeType: "application/json",
  },
  {
    uri: "resource://99freelas/tool-catalog",
    name: "tool-catalog",
    description: "Human-readable catalog of the core 99Freelas MCP tools and natural flows.",
    mimeType: "text/markdown",
  },
  {
    uri: "resource://99freelas/prompt-catalog",
    name: "prompt-catalog",
    description: "Available MCP prompts with their intended use cases and arguments.",
    mimeType: "application/json",
  },
  {
    uri: "resource://99freelas/operating-playbook",
    name: "operating-playbook",
    description: "Recommended decision flow for project triage, detail expansion, inbox history, and proposal safety.",
    mimeType: "text/markdown",
  },
  {
    uri: "resource://99freelas/quickstart",
    name: "quickstart",
    description: "Minimal quickstart for installing and using the local adapter.",
    mimeType: "text/markdown",
  },
  {
    uri: "resource://99freelas/skills-catalog",
    name: "skills-catalog",
    description: "Compact 99Freelas skill catalog index. Use resource templates for paged or filtered slices.",
    mimeType: "application/json",
  },
  {
    uri: "resource://99freelas/skills-stacks",
    name: "skills-stacks",
    description: "Curated skill stacks grouped by use case for better profile positioning.",
    mimeType: "text/markdown",
  },
  {
    uri: "resource://99freelas/skills-selection-guide",
    name: "skills-selection-guide",
    description: "Short guide for choosing and validating profile skills.",
    mimeType: "text/markdown",
  },
  {
    uri: "resource://99freelas/policies-summary",
    name: "policies-summary",
    description: "Compact safety summary from the 99Freelas terms of use and privacy policy.",
    mimeType: "application/json",
  },
  ...listWidgetResources(),
];

const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: "resource://99freelas/skills-catalog/page/{offset}",
    name: "skills-catalog-page",
    title: "skills-catalog-page",
    description: "Compact paginated slices of the 99Freelas skill catalog. Offset defaults to 0 and page size is capped.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "resource://99freelas/skills-catalog/search/{query}",
    name: "skills-catalog-search",
    title: "skills-catalog-search",
    description: "Compact filtered slices of the 99Freelas skill catalog for a query string.",
    mimeType: "application/json",
  },
];

const promptInstructions: Record<PromptName, string> = {
  screen_projects_for_fit:
    "Start with projects_list or projects_listByAvailability and score only the visible list fields against the target profile. Do not call projects_get for every project. Open details only for shortlisted items that match stack, area, or business fit. Return: shortlisted projects, rejected projects, and why.",
  analyze_project:
    "Use this only after a project already passed list-level triage. Start by calling projects_get. Inspect the project scope, client profile link, and signs of fit. If the client matters for decision quality, call profiles_get. If you need bidding constraints, call projects_getBidContext. Return: fit summary, risks, recommended next action, and whether to bid.",
  draft_proposal:
    "Before drafting the proposal, call projects_get and projects_getBidContext. Check minimumOfferCents, userCanBid, and duplicate risk. Then draft a concise client-facing proposal tailored to the project language and requirements.",
  reply_inbox:
    "Call inbox_getThread first. Summarize the thread, identify the latest client intent, and draft a short response that preserves context and avoids duplicate wording.",
  monitor_account:
    "Check system_health, inbox_getDirectoryCounts, account_getSubscriptionStatus, and the latest project availability. Return a concise monitoring summary with any action items.",
  auth_listSessions:
    "Inspect stored account sessions, usernames, session IDs, and cookie names without exposing raw cookie values. Use this before clearing a session or auditing connected accounts.",
  refine_profile_skills:
    "Use the curated skill stacks first, then query a compact catalog slice only for the exact skillIds you still need. Keep the profile focused, prefer one dominant stack, and return a short rationale for the selected stack and any supporting skills.",
  review_99freelas_policies:
    "Read the platform policy summary before proposing, replying, updating profile data, or suggesting any contact details. Return a concise checklist of forbidden actions, safe actions, and any risk flags that matter right now.",
};

const promptMessages: Record<PromptName, string> = {
  screen_projects_for_fit:
    "You are triaging 99Freelas projects for fit. Start from projects_list or projects_listByAvailability, compare only the list-level fields against the target profile, and shortlist a small number of high-fit candidates. Do not open project details unless the title, summary, category, subcategory, experience level, or metrics justify the extra step.",
  analyze_project:
    "You are a 99Freelas operator. Use this only after a project has already passed triage. Start with projects_get, expand the client context when needed with profiles_get, and validate bid constraints with projects_getBidContext. Analyze fit, risk, and conversion potential before deciding whether to bid.",
  draft_proposal:
    "You are preparing a proposal for a 99Freelas project. Start with projects_get and projects_getBidContext, confirm minimumOfferCents and userCanBid, then draft a human, specific proposal. Avoid generic fluff and avoid any contact details outside the platform.",
  reply_inbox:
    "You are replying to a 99Freelas client thread. Read inbox_getThread first, preserve context, answer the latest message directly, and keep the response concise and professional. If needed, reuse the associated project context before sending inbox_sendMessage.",
  monitor_account:
    "You are monitoring the freelancer account for new messages, status changes, subscription state, and recent project opportunities. Start with system_health, inbox_getDirectoryCounts, and account_getSubscriptionStatus. Focus on signal, not noise.",
  auth_listSessions:
    "You are auditing stored 99Freelas sessions. List the saved sessions by account, summarize which accounts are active, and if asked remove one by clearing its active session. Never expose raw cookies or secrets.",
  refine_profile_skills:
    "You are refining a 99Freelas profile. Read the current profile state and start from the curated stacks. Query a compact catalog slice only for the exact remaining skillIds you need, choose only valid skillIds, and keep the final selection focused. For dev profiles, bias toward backend-api, frontend-ui, qa-automation, data-ai, mobile-apps, or devops-cloud before mixing stacks. Return the chosen skillIds, the stack name, and a short explanation of why this selection fits the desired positioning.",
  review_99freelas_policies:
    "You are enforcing 99Freelas safety rules. Read the policy summary first and use it before proposing, replying, or editing profile data. Never suggest contact details, off-platform payment, spam, offensive content, or policy-breaking behavior. Return a compact list of safe reminders and red flags.",
};

const promptResult = (name: PromptName, args: Record<string, string> | undefined): GetPromptResult => {
  const argEntries = Object.entries(args ?? {});
  const header = [
    `Prompt: ${name}`,
    ...(argEntries.length > 0 ? [`Arguments: ${argEntries.map(([key, value]) => `${key}=${value}`).join(", ")}`] : []),
  ].join("\n");

  return {
    description: promptInstructions[name],
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `${header}\n\n${promptMessages[name]}`,
        },
      },
    ],
  };
};

const resourceText = (uri: string): string => {
  if (isWidgetResourceUri(uri)) {
    return getWidgetResourceHtml(uri);
  }

  switch (uri) {
    case "resource://99freelas/server-manifest":
      return JSON.stringify(
        {
          name: "99freelas-mcp-server",
          version: "0.2.0",
          transports: ["stdio", "streamable-http"],
          baseUrl: BASE_URL,
          authentication: {
            mode: "manual cookie import",
            encryptedAtRest: true,
          },
        guardrails: [
          "rate limit",
          "dedup proposals",
          "dedup messages",
          "dry run support",
          "audit logging",
        ],
        skillStackKeys: getCuratedSkillStacks().map((stack) => stack.key),
        availablePrompts: promptCatalog.map((prompt) => prompt.name),
        availableResources: resourceCatalog.map((resource) => resource.uri),
      },
        null,
        2,
      );
    case "resource://99freelas/tool-catalog":
      return `# 99Freelas MCP Tool Catalog

Core natural flows:

- \`projects_list\` -> discover projects by category, page, sort, and timeframe.
- \`projects_list\` or \`projects_listByAvailability\` -> screen for fit before opening project details.
- \`projects_get\` -> read the project detail page only for shortlisted projects and inspect the client.
- \`profiles_get\` -> expand the contractor profile when extra context matters.
- \`projects_getBidContext\` -> validate minimum offer, eligibility, and bid flags.
- \`proposals_send\` -> send a proposal only after the bid context is valid.
- \`inbox_listConversations\` -> page through inbox history with \`start\` and \`limit\`.
- \`inbox_getThread\` -> load the full thread before replying.
- \`inbox_sendMessage\` -> send a reply without duplicating existing text.
- \`notifications_list\` -> read notifications; pass \`markViewed=true\` only when you intentionally want to clear unread state.
- \`auth_listSessions\` -> inspect stored account sessions and audit connected accounts without revealing cookies.
- \`auth_clearSession\` -> disable the active session for one accountId.
- \`account_getSubscriptionStatus\` -> check whether the account is premium before exclusive bids.
- \`profile_getInterestCatalog\` and \`profile_getEditState\` -> inspect the profile before \`profile_update\`.
  - \`skills_getCatalog\`, \`skills_getStacks\`, and \`skills_getSelectionGuide\` -> inspect the skill catalog from the MCP itself; prefer stacks and compact catalog slices first.
  - \`resource://99freelas/skills-stacks\` -> start from a curated stack before choosing \`skillIds\`.
  - \`resource://99freelas/skills-catalog\` -> read the compact index and then use the page/search resource templates for targeted lookups.

Operational notes:

- Always keep the session local and encrypted at rest.
- Always prefer read-only inspection before destructive actions.
- Use \`auth_listSessions\` before \`auth_clearSession\` when you need to audit or prune connected accounts.
- Do not open every project detail page blindly. Triage from list data first, then expand only shortlisted projects.
- Do not assume inbox history is complete on page 1. Use \`start\` pagination when you need older conversations.
- Keep the agent loop in the consuming app, not in the MCP server.`;
    case "resource://99freelas/operating-playbook":
      return `# Operating Playbook

## Project discovery

1. Start with \`projects_list\` or \`projects_listByAvailability\`.
2. Compare list fields against the freelancer profile: title, summary, category, subcategory, experience level, recency, and proposal pressure.
3. Shortlist only the strongest candidates.
4. Call \`projects_get\` only for shortlisted projects.
5. Call \`profiles_get\` only when the owner or competitors matter for decision quality.
6. Call \`projects_getBidContext\` only when the project still looks worth bidding on.

## Project fit rule

- List pages are for filtering.
- Detail pages are for validation.
- Bid context is for execution.

If a project is outside the target area, do not open details unless there is an explicit strategic reason.

## Inbox history

1. Start with \`inbox_listConversations\`.
2. If the target conversation is not visible, increase \`start\` to page older history.
3. Open \`inbox_getThread\` only after you identify the right conversation.
4. Reply only after reading the full thread.

## Notifications

1. Use \`notifications_list\` to read recent alerts.
2. Leave \`markViewed=false\` for inspection; set \`markViewed=true\` only when you want to clear the unread state after reading.
3. Treat acceptance, goal completion, and profile alerts as high-priority signals.

## Safe expansion

- Prefer one extra step at a time.
- Do not chain into owner and competitor profiles for every project.
- Escalate to \`profiles_get\` only when the detail page exposes a useful \`username\` and the profile will affect the decision.`;
    case "resource://99freelas/skills-catalog":
      return getSkillCatalogIndexResourceJson();
    case "resource://99freelas/skills-stacks":
      return getSkillStacksResourceMarkdown();
    case "resource://99freelas/skills-selection-guide":
      return getSkillSelectionGuideMarkdown();
    case "resource://99freelas/policies-summary":
      return JSON.stringify(
        {
          source: "99Freelas terms and privacy pages",
          forbiddenActions: [
            "Do not add contact details or links to profile/portfolio.",
            "Do not request or share contact details in proposal, question, or chat.",
            "Do not request or accept payment outside the platform.",
            "Do not mention platform commission in the proposal text.",
            "Do not send offensive, spammy, fraudulent, or plagiarized content.",
          ],
          safeActions: [
            "Keep negotiations and delivery inside the platform.",
            "Use the chat and proposal flow as the official record.",
            "Prefer concise, professional, on-platform messages.",
            "Treat profile data as public, but not contact fields.",
          ],
          disputeNotes: [
            "Chat messages and attachments can be reviewed in disputes.",
            "Scope, proposal, and on-platform communications matter most.",
            "Non-response or off-platform negotiation increases risk.",
          ],
          privacyNotes: [
            "Cookies are used to improve experience.",
            "The platform does not guarantee safety outside its own channels.",
            "Public profile data is accessible to visitors.",
          ],
          riskFlags: [
            "Ask for approval before any action that could expose contact details.",
            "Avoid proposing anything that implies off-platform payment or communication.",
          ],
        },
        null,
        2,
      );
    case "resource://99freelas/prompt-catalog":
      return JSON.stringify(
        promptCatalog.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
        null,
        2,
      );
    case "resource://99freelas/quickstart":
      return `# Quickstart

1. Install dependencies with \`npm install\`.
2. Add \`.env\` with \`SESSION_ENCRYPTION_KEY_BASE64\` and optional \`MANUAL_COOKIES_FILE\`.
3. Import cookies with \`auth_importCookies\` or drop a JSON export into \`.data/manual-cookies.json\`.
4. Start the server with \`npm run dev\` or \`docker compose up --build\`.
5. Triage with \`projects_list\` first, then open details only for shortlisted projects with \`projects_get\`.
6. Use \`profiles_get\`, \`projects_getBidContext\`, and \`inbox_getThread\` only when the previous step justifies them.

The server is a private/local adapter for the 99Freelas platform.`;
    default:
      if (uri.startsWith("resource://99freelas/skills-catalog/page/")) {
        const raw = uri.slice("resource://99freelas/skills-catalog/page/".length);
        const offset = Number(raw);
        if (!Number.isFinite(offset) || offset < 0) {
          throw new Error(`Unknown resource: ${uri}`);
        }
        return getSkillCatalogPageResourceJson({ offset });
      }
      if (uri.startsWith("resource://99freelas/skills-catalog/search/")) {
        const raw = uri.slice("resource://99freelas/skills-catalog/search/".length);
        return getSkillCatalogPageResourceJson({ query: decodeURIComponent(raw) });
      }
      throw new Error(`Unknown resource: ${uri}`);
  }
};

const resourceMimeType = (uri: string): string => {
  const widgetMimeType = getWidgetResourceMimeType(uri);
  if (widgetMimeType) {
    return widgetMimeType;
  }

  if (uri.startsWith("resource://99freelas/skills-catalog/page/")) {
    return "application/json";
  }
  if (uri.startsWith("resource://99freelas/skills-catalog/search/")) {
    return "application/json";
  }
  const resource = resourceCatalog.find((entry) => entry.uri === uri);
  return resource?.mimeType ?? "text/plain";
};

export const listProductPrompts = (): ListPromptsResult => ({
  prompts: promptCatalog,
});

export const getProductPrompt = (name: string, args?: Record<string, string>): GetPromptResult => {
  if (!(name in promptMessages)) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return promptResult(name as PromptName, args);
};

export const listProductResources = (): ListResourcesResult => ({
  resources: resourceCatalog,
});

export const listProductResourceTemplates = (): ListResourceTemplatesResult => ({
  resourceTemplates,
});

export const readProductResource = (uri: string): ReadResourceResult => ({
  contents: [
    {
      uri,
      mimeType: resourceMimeType(uri),
      text: resourceText(uri),
    },
  ],
});
