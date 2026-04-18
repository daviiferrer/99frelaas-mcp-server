import "dotenv/config";
import { CookieStore } from "./auth/cookieStore";
import { SessionManager } from "./auth/sessionManager";
import { HttpClient } from "./clients/httpClient";
import { RateLimiter } from "./security/rateLimiter";
import { AuditLogStore } from "./storage/auditLogStore";
import { CacheStore } from "./storage/cacheStore";
import { SessionStore } from "./storage/sessionStore";
import { ProjectsAdapter } from "./adapters/projectsAdapter";
import { ProposalsAdapter } from "./adapters/proposalsAdapter";
import { InboxAdapter } from "./adapters/inboxAdapter";
import { AccountAdapter } from "./adapters/accountAdapter";
import { ProfileAdapter } from "./adapters/profileAdapter";
import { logger } from "./security/logger";
import { createServer, startStdioServer, type AppContext } from "./server/createServer";

export const buildAppContext = (): AppContext => {
  const baseUrl = process.env.NINETY_NINE_BASE_URL ?? "https://www.99freelas.com.br";
  const ratePerMinute = Number(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE ?? 60);

  logger.info("server.build", {
    baseUrl,
    ratePerMinute,
    stateDbFile: process.env.STATE_DB_FILE ?? ".data/state.sqlite",
    stateDbJournalMode: process.env.STATE_DB_JOURNAL_MODE ?? "WAL",
    manualCookiesFile: process.env.MANUAL_COOKIES_FILE ?? ".data/manual-cookies.json",
    logLevel: process.env.LOG_LEVEL ?? "info",
    logFile: process.env.LOG_FILE ?? null,
    logStderr: process.env.LOG_STDERR ?? "false",
    nodeVersion: process.version,
  });

  const httpClient = new HttpClient(baseUrl);
  const sessionStore = new SessionStore();
  const cookieStore = new CookieStore();
  const sessionManager = new SessionManager(sessionStore, cookieStore);
  const cacheStore = new CacheStore();
  const rateLimiter = new RateLimiter(ratePerMinute, cacheStore);
  const auditLog = new AuditLogStore();

  const projectsAdapter = new ProjectsAdapter(httpClient);
  const proposalsAdapter = new ProposalsAdapter(httpClient);
  const inboxAdapter = new InboxAdapter(httpClient);
  const accountAdapter = new AccountAdapter(httpClient);
  const profileAdapter = new ProfileAdapter(httpClient);

  return {
    sessionManager,
    httpClient,
    projectsAdapter,
    proposalsAdapter,
    inboxAdapter,
    accountAdapter,
    profileAdapter,
    rateLimiter,
    cacheStore,
    auditLog,
  };
};

export const buildServer = (ctx = buildAppContext()) => createServer(ctx);

export const run = async (): Promise<void> => {
  logger.info("server.run.start");
  const server = buildServer();
  await startStdioServer(server);
};

if (require.main === module) {
  run().catch((err) => {
    process.stderr.write(`[99freelas-mcp] fatal error: ${String(err)}\n`);
    process.exit(1);
  });
}
