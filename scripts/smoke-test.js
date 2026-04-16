const path = require("path");
const { existsSync } = require("fs");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function run() {
  const serverPath = path.resolve(__dirname, "..", "dist", "index.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client(
    { name: "99freelas-smoke-client", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name).sort();

  const calls = {};
  const call = async (name, arguments_) => {
    const result = await client.callTool({ name, arguments: arguments_ });
    calls[name] = result;
    return result;
  };

  await call("auth_checkSession", {});
  const manualCookiesFile = process.env.MANUAL_COOKIES_FILE
    ? path.resolve(process.cwd(), process.env.MANUAL_COOKIES_FILE)
    : path.resolve(process.cwd(), ".data", "manual-cookies.json");
  if (!existsSync(manualCookiesFile)) {
    throw new Error(`Manual cookies file not found: ${manualCookiesFile}`);
  }
  await call("auth_importCookies", { filePath: manualCookiesFile });
  await call("auth_clearSession", {});
  await call("auth_importCookies", { filePath: manualCookiesFile });
  await call("system_health", {});
  await call("projects_listCategories", {});
  await call("profile_getInterestCatalog", {});
  await call("profile_getEditState", {});
  await call("profile_update", {
    name: "Carlos Vieira",
    nickname: "carlos-vieira-mkt",
    professionalTitle: "Freelancer de Marketing Digital | Estratégia, Conteúdo e Growth",
    about: "Sou Carlos Vieira, freelancer de marketing digital com foco em estratégia, conteúdo e performance.",
    professionalSummary: "Atuo com marketing digital apoiando marcas e empreendedores na construção de posicionamento, geração de leads e aumento de conversão.",
    interestAreaIds: [155, 109, 112, 6],
    skillIds: [1648, 1237, 147, 1453, 80, 303],
    photoPresent: true,
  });
  await call("projects_list", { categorySlug: "vendas-e-marketing", page: 1, sort: "newest", timeframe: "24h" });
  await call("projects_listByAvailability", {
    categorySlug: "vendas-e-marketing",
    page: 1,
    maxPages: 1,
    sort: "newest",
    timeframe: "24h",
    delayMs: 1500,
  });
  await call("projects_get", { projectId: 724132, projectSlug: "criar-graficos-no-excel-ou-dashboard-no-power-bi" });
  await call("projects_getBidContext", { projectId: 724132, projectSlug: "criar-graficos-no-excel-ou-dashboard-no-power-bi" });
  await call("proposals_send", {
    projectId: 724132,
    projectSlug: "criar-graficos-no-excel-ou-dashboard-no-power-bi",
    offerCents: 3750,
    durationDays: 5,
    proposalText: "Mensagem de teste para verificar o contrato real da proposta.",
    promote: false,
    dryRun: true,
  });
  await call("inbox_getDirectoryCounts", {});
  await call("inbox_listConversations", {});
  await call("inbox_getThread", { conversationId: 16352769 });
  await call("inbox_getMessages", { conversationId: 16352769 });
  await call("inbox_sendMessage", { conversationId: 16352769, text: `Mensagem de teste do MCP ${Date.now()}` });
  await call("account_getConnections", {});
  await call("account_getDashboardSummary", {});

  console.log(JSON.stringify({ ok: true, toolNames, calls }, null, 2));

  await client.close();
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }, null, 2));
  process.exit(1);
});
