import "dotenv/config";
import { buildAppContext, buildServer } from "./index";
import { logger } from "./security/logger";
import { startHttpServer } from "./transport/http";

const readRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for HTTP transport`);
  }
  return value;
};

export const runHttp = async (): Promise<void> => {
  const apiKey = readRequiredEnv("MCP_API_KEY");
  const host = process.env.HOST?.trim() || "0.0.0.0";
  const port = Number(process.env.PORT ?? 3000);
  const mcpPath = process.env.MCP_HTTP_PATH?.trim() || "/mcp";
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  const appContext = buildAppContext();
  const running = await startHttpServer(() => buildServer(appContext), {
    apiKey,
    host,
    port,
    mcpPath,
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
