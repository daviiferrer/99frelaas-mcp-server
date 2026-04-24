import "dotenv/config";
import { buildAppContext, buildServer } from "./index";
import { loadGithubWebhookConfig } from "./deploy/githubWebhook";
import { logger } from "./security/logger";
import { startHttpServer } from "./transport/http";

export const runHttp = async (): Promise<void> => {
  const host = process.env.HOST?.trim() || "0.0.0.0";
  const port = Number(process.env.PORT ?? 3000);
  const mcpPath = process.env.MCP_HTTP_PATH?.trim() || "/mcp";
  const githubWebhook = loadGithubWebhookConfig();
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  const appContext = buildAppContext();
  const running = await startHttpServer(() => buildServer(appContext), {
    host,
    port,
    mcpPath,
    githubWebhook,
  });

  const shutdown = async (signal: string) => {
    logger.info("server.shutdown.start", { signal, transport: "http" });
    await running.close();
    logger.info("server.shutdown.complete", { signal, transport: "http" });
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

if (require.main === module) {
  runHttp().catch((err) => {
    process.stderr.write(`[99freelas-mcp] fatal http error: ${String(err)}\n`);
    process.exit(1);
  });
}
