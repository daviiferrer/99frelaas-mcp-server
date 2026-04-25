import { randomUUID } from "crypto";
import { AuthRequiredError } from "../domain/errors";
import { nowIso } from "../utils/time";
import { CookieStore } from "./cookieStore";
import { SessionStore } from "../storage/sessionStore";
import { SessionState } from "../domain/models";
import { Cookie } from "../clients/httpClient";
import { getErrorMeta, logger } from "../security/logger";

const isCookieExpired = (cookie: Cookie, nowSeconds: number): boolean =>
  typeof cookie.expires === "number" && cookie.expires > 0 && cookie.expires <= nowSeconds;

const filterActiveCookies = (cookies: Cookie[], nowSeconds: number): Cookie[] =>
  cookies.filter((cookie) => !isCookieExpired(cookie, nowSeconds));

export class SessionManager {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly cookieStore: CookieStore,
  ) {}

  async createOrUpdateSession(input: {
    userId?: string;
    username?: string;
    cookies: Cookie[];
    accountId?: string;
  }): Promise<{ sessionId: string; accountId: string }> {
    const accountId = input.accountId?.trim() || input.username?.trim();
    if (!accountId?.trim()) {
      throw new Error("accountId or username is required to create or update a session");
    }
    logger.info("session.upsert.start", { accountId, cookieCount: input.cookies.length });
    const active = await this.sessionStore.getActive(accountId);
    const sessionId = active?.sessionId ?? `sess_${randomUUID()}`;
    await this.sessionStore.save(
      {
        sessionId,
        userId: input.userId,
        username: input.username,
        lastValidatedAt: nowIso(),
        updatedAt: nowIso(),
        cookies: this.cookieStore.toStored(input.cookies),
      },
      accountId,
    );
    logger.info("session.upsert.ok", { accountId, sessionId, reused: Boolean(active?.sessionId) });
    return { sessionId, accountId };
  }

  async requireCookies(accountId: string): Promise<Cookie[]> {
    logger.debug("session.require.start", { accountId });
    const active = await this.sessionStore.getActive(accountId);
    if (!active || active.cookies.length === 0) {
      logger.warn("session.require.fail", { accountId, reason: "no_active_session" });
      throw new AuthRequiredError("No active authenticated session");
    }
    let cookies: Cookie[];
    try {
      cookies = this.cookieStore.fromStored(active);
    } catch (error) {
      logger.error("session.require.decrypt_fail", { accountId, sessionId: active.sessionId, ...getErrorMeta(error) });
      throw error;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validCookies = filterActiveCookies(cookies, nowSeconds);
    if (validCookies.length === 0) {
      await this.sessionStore.clearActive(accountId);
      logger.warn("session.require.fail", { accountId, reason: "expired_cookies", sessionId: active.sessionId });
      throw new AuthRequiredError("Stored cookies expired. Import a fresh session with auth_importCookies.");
    }
    if (validCookies.length !== cookies.length) {
      await this.createOrUpdateSession({
        accountId,
        cookies: validCookies,
        userId: active.userId,
        username: active.username,
      });
    }
    logger.debug("session.require.ok", { accountId, cookieCount: validCookies.length, sessionId: active.sessionId });
    return validCookies;
  }

  async checkSession(accountId: string): Promise<SessionState> {
    logger.debug("session.check.start", { accountId });
    const active = await this.sessionStore.getActive(accountId);
    if (!active) {
      logger.debug("session.check.empty", { accountId });
      return { isAuthenticated: false, cookiesPresent: [] };
    }
    const cookies = this.cookieStore.fromStored(active);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validCookies = filterActiveCookies(cookies, nowSeconds);
    if (validCookies.length === 0) {
      await this.sessionStore.clearActive(accountId);
      logger.info("session.check.pruned_expired", { accountId, sessionId: active.sessionId });
      return { isAuthenticated: false, cookiesPresent: [] };
    }
    if (validCookies.length !== cookies.length) {
      await this.createOrUpdateSession({
        accountId,
        cookies: validCookies,
        userId: active.userId,
        username: active.username,
      });
    }
    logger.debug("session.check.ok", { accountId, sessionId: active.sessionId, cookieCount: validCookies.length });
    return {
      isAuthenticated: validCookies.length > 0,
      cookiesPresent: validCookies.map((c) => c.name),
      userId: active.userId,
      username: active.username,
      lastValidatedAt: active.lastValidatedAt,
      sessionId: active.sessionId,
    };
  }

  async clearSession(accountId: string): Promise<void> {
    logger.info("session.clear", { accountId });
    await this.sessionStore.clearActive(accountId);
  }

  async getPreferredAccountId(): Promise<string | undefined> {
    const sessions = await this.sessionStore.listSessions();
    const activeSessions = sessions.filter((session) => session.active);
    return activeSessions[0]?.accountId;
  }

  async listSessions(): Promise<Array<{
    accountId: string;
    sessionId: string;
    userId?: string;
    username?: string;
    lastValidatedAt?: string;
    updatedAt: string;
    active: boolean;
    cookieNames: string[];
  }>> {
    return this.sessionStore.listSessions();
  }
}
