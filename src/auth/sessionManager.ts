import { randomUUID } from "crypto";
import { AuthRequiredError } from "../domain/errors";
import { nowIso } from "../utils/time";
import { CookieStore } from "./cookieStore";
import { SessionStore } from "../storage/sessionStore";
import { SessionState } from "../domain/models";
import { Cookie } from "../clients/httpClient";
import { getErrorMeta, logger } from "../security/logger";

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
  }): Promise<{ sessionId: string }> {
    const accountId = input.accountId ?? "default";
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
    return { sessionId };
  }

  async requireCookies(accountId = "default"): Promise<Cookie[]> {
    logger.debug("session.require.start", { accountId });
    const active = await this.sessionStore.getActive(accountId);
    if (!active || active.cookies.length === 0) {
      logger.warn("session.require.fail", { accountId, reason: "no_active_session" });
      throw new AuthRequiredError("No active authenticated session");
    }
    try {
      const cookies = this.cookieStore.fromStored(active);
      logger.debug("session.require.ok", { accountId, cookieCount: cookies.length, sessionId: active.sessionId });
      return cookies;
    } catch (error) {
      logger.error("session.require.decrypt_fail", { accountId, sessionId: active.sessionId, ...getErrorMeta(error) });
      throw error;
    }
  }

  async checkSession(accountId = "default"): Promise<SessionState> {
    logger.debug("session.check.start", { accountId });
    const active = await this.sessionStore.getActive(accountId);
    if (!active) {
      logger.debug("session.check.empty", { accountId });
      return { isAuthenticated: false, cookiesPresent: [] };
    }
    logger.debug("session.check.ok", { accountId, sessionId: active.sessionId, cookieCount: active.cookies.length });
    return {
      isAuthenticated: active.cookies.length > 0,
      cookiesPresent: active.cookies.map((c) => c.name),
      userId: active.userId,
      username: active.username,
      lastValidatedAt: active.lastValidatedAt,
      sessionId: active.sessionId,
    };
  }

  async clearSession(accountId = "default"): Promise<void> {
    logger.info("session.clear", { accountId });
    await this.sessionStore.clearActive(accountId);
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
