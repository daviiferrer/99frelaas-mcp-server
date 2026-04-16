import "dotenv/config";
import { CookieStore } from "./auth/cookieStore";
import { SessionManager } from "./auth/sessionManager";
import { HttpClient } from "./clients/httpClient";
import { RateLimiter } from "./security/rateLimiter";
import { AuditLogStore } from "./storage/auditLogStore";
import { CacheStore } from "./storage/cacheStore";
import { SessionStore } from "./storage/sessionStore";
import { createServer, startStdioServer } from "./server/createServer";
import { ProjectsAdapter } from "./adapters/projectsAdapter";
import { ProposalsAdapter } from "./adapters/proposalsAdapter";
import { InboxAdapter } from "./adapters/inboxAdapter";
import { AccountAdapter } from "./adapters/accountAdapter";
import { ProfileAdapter } from "./adapters/profileAdapter";

export const buildServer = () => {
  const baseUrl = process.env.NINETY_NINE_BASE_URL ?? "https://www.99freelas.com.br";
  const ratePerMinute = Number(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE ?? 60);
  const proposalsDailyLimit = Number(process.env.PROPOSALS_DAILY_LIMIT ?? 25);

  const httpClient = new HttpClient(baseUrl);
  const sessionStore = new SessionStore();
  const cookieStore = new CookieStore();
  const sessionManager = new SessionManager(sessionStore, cookieStore);
  const rateLimiter = new RateLimiter(ratePerMinute);
  const cacheStore = new CacheStore();
  const auditLog = new AuditLogStore();
  const proposalDayCounter = new Map<string, number>();

  const projectsAdapter = new ProjectsAdapter(httpClient);
  const proposalsAdapter = new ProposalsAdapter(httpClient);
  const inboxAdapter = new InboxAdapter(httpClient);
  const accountAdapter = new AccountAdapter(httpClient);
  const profileAdapter = new ProfileAdapter(httpClient);

  return createServer({
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
    proposalsDailyLimit,
    proposalDayCounter,
  });
};

export const run = async (): Promise<void> => {
  const server = buildServer();
  await startStdioServer(server);
};

if (require.main === module) {
  run().catch((err) => {
    process.stderr.write(`[99freelas-mcp] fatal error: ${String(err)}\n`);
    process.exit(1);
  });
}
