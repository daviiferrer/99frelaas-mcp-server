import { randomUUID } from "crypto";
import { AuthRequiredError } from "../domain/errors";
import { nowIso } from "../utils/time";
import { CookieStore } from "./cookieStore";
import { SessionStore } from "../storage/sessionStore";
import { SessionState } from "../domain/models";
import { Cookie } from "../clients/httpClient";

export class SessionManager {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly cookieStore: CookieStore,
  ) {}

  async createOrUpdateSession(input: {
    userId?: string;
    username?: string;
    cookies: Cookie[];
  }): Promise<{ sessionId: string }> {
    const active = await this.sessionStore.getActive();
    const sessionId = active?.sessionId ?? `sess_${randomUUID()}`;
    await this.sessionStore.save({
      sessionId,
      userId: input.userId,
      username: input.username,
      lastValidatedAt: nowIso(),
      updatedAt: nowIso(),
      cookies: this.cookieStore.toStored(input.cookies),
    });
    return { sessionId };
  }

  async requireCookies(): Promise<Cookie[]> {
    const active = await this.sessionStore.getActive();
    if (!active || active.cookies.length === 0) {
      throw new AuthRequiredError("No active authenticated session");
    }
    return this.cookieStore.fromStored(active);
  }

  async checkSession(): Promise<SessionState> {
    const active = await this.sessionStore.getActive();
    if (!active) {
      return { isAuthenticated: false, cookiesPresent: [] };
    }
    return {
      isAuthenticated: active.cookies.length > 0,
      cookiesPresent: active.cookies.map((c) => c.name),
      userId: active.userId,
      username: active.username,
      lastValidatedAt: active.lastValidatedAt,
      sessionId: active.sessionId,
    };
  }

  async clearSession(): Promise<void> {
    await this.sessionStore.clearActive();
  }
}
