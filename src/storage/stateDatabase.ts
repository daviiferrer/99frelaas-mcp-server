import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile } from "fs/promises";
import { dirname } from "path";
import { SessionRecord } from "../auth/authTypes";
import { RateLimitError } from "../domain/errors";
import { elapsedMs, getErrorMeta, logger } from "../security/logger";
import { redactValue } from "../security/redact";
import { nowIso } from "../utils/time";

type LegacySessionStoreFile = {
  activeSessionIdByAccount?: Record<string, string>;
  sessionsByAccount?: Record<string, SessionRecord[]>;
  activeSessionId?: string;
  sessions?: SessionRecord[];
};

type LegacyCachePayload = {
  sentProposalsByProjectIdByAccount?: Record<string, number[]>;
  sentMessageHashesByAccount?: Record<string, string[]>;
  sentProposalsByProjectId?: number[];
  sentMessageHashes?: string[];
};

const resolveDbPath = (): string => process.env.STATE_DB_FILE ?? ".data/state.sqlite";
const resolveLegacySessionFile = (): string => process.env.SESSION_FILE ?? ".data/sessions.json";
const resolveLegacyCacheFile = (): string => process.env.CACHE_FILE ?? ".data/cache.json";

const resolveJournalMode = (): string => (process.env.STATE_DB_JOURNAL_MODE ?? "WAL").toUpperCase();

const schemaSql = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  accountId TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  userId TEXT,
  username TEXT,
  lastValidatedAt TEXT,
  updatedAt TEXT NOT NULL,
  cookiesJson TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (accountId, sessionId)
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_active ON sessions(accountId, active);

CREATE TABLE IF NOT EXISTS proposal_dedupe (
  accountId TEXT NOT NULL,
  projectId INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (accountId, projectId)
);

CREATE TABLE IF NOT EXISTS message_dedupe (
  accountId TEXT NOT NULL,
  messageHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (accountId, messageHash)
);

CREATE TABLE IF NOT EXISTS proposal_daily_counter (
  accountId TEXT NOT NULL,
  dayKey TEXT NOT NULL,
  sentCount INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (accountId, dayKey)
);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  rateKey TEXT PRIMARY KEY,
  windowStartMs INTEGER NOT NULL,
  requestCount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  event TEXT NOT NULL,
  payloadJson TEXT NOT NULL
);
`;

const instances = new Map<string, StateDatabase>();

const readJsonIfExists = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  }
  /* c8 ignore next 2 */
  catch {
    return undefined;
  }
};

const withTransaction = <T>(db: DatabaseSync, fn: () => T): T => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore rollback failures */
    }
    throw error;
  }
};

export class StateDatabase {
  private readonly db: DatabaseSync;
  private initialized = false;
  private initPromise?: Promise<void>;

  private constructor(private readonly filePath: string) {
    const startedAt = Date.now();
    this.db = new DatabaseSync(filePath);
    const configuredJournalMode = resolveJournalMode();
    try {
      this.db.exec(`PRAGMA journal_mode = ${configuredJournalMode};`);
      logger.info("db.journal_mode.applied", { filePath, configuredJournalMode, durationMs: elapsedMs(startedAt) });
    } catch {
      // Some Docker bind mounts on Windows fail with WAL/SHM.
      // Fallback keeps the server alive for stdio discovery and tool execution.
      this.db.exec("PRAGMA journal_mode = DELETE;");
      logger.warn("db.journal_mode.fallback", {
        filePath,
        configuredJournalMode,
        fallbackJournalMode: "DELETE",
        durationMs: elapsedMs(startedAt),
      });
    }
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
  }

  static async open(filePath = resolveDbPath()): Promise<StateDatabase> {
    const cached = instances.get(filePath);
    /* c8 ignore next 3 */
    if (cached) {
      logger.debug("db.open.cached", { filePath });
      await cached.ensureInitialized();
      return cached;
    }

    logger.info("db.open.start", { filePath });
    await mkdir(dirname(filePath), { recursive: true });
    const database = new StateDatabase(filePath);
    instances.set(filePath, database);
    await database.ensureInitialized();
    logger.info("db.open.ok", { filePath });
    return database;
  }

  static closeAll(): void {
    for (const database of instances.values()) {
      try {
        database.db.close();
      } catch {
        /* ignore close failures */
      }
    }
    instances.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const startedAt = Date.now();
        try {
          this.db.exec(schemaSql);
          await this.migrateLegacyJsonIfNeeded();
          this.initialized = true;
          logger.info("db.init.ok", { filePath: this.filePath, durationMs: elapsedMs(startedAt) });
        } catch (error) {
          logger.error("db.init.fail", { filePath: this.filePath, durationMs: elapsedMs(startedAt), ...getErrorMeta(error) });
          throw error;
        }
      })();
    }
    await this.initPromise;
  }

  private getMeta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value?: string } | undefined;
    return row?.value;
  }

  private setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  private async migrateLegacyJsonIfNeeded(): Promise<void> {
    if (this.getMeta("legacy_json_migrated_v1") === "true") {
      logger.debug("db.migration.skip", { filePath: this.filePath, reason: "already_migrated" });
      return;
    }

    const legacySessions = await readJsonIfExists<LegacySessionStoreFile>(resolveLegacySessionFile());
    const legacyCache = await readJsonIfExists<LegacyCachePayload>(resolveLegacyCacheFile());
    logger.info("db.migration.start", {
      filePath: this.filePath,
      hasLegacySessions: Boolean(legacySessions),
      hasLegacyCache: Boolean(legacyCache),
    });

    withTransaction(this.db, () => {
      if (legacySessions) {
        const activeSessionIdByAccount = { ...(legacySessions.activeSessionIdByAccount ?? {}) };
        const sessionsByAccount = { ...(legacySessions.sessionsByAccount ?? {}) };
        const defaultAccountId = "default";

        if (legacySessions.activeSessionId && !activeSessionIdByAccount[defaultAccountId]) {
          activeSessionIdByAccount[defaultAccountId] = legacySessions.activeSessionId;
        }
        if (legacySessions.sessions && !sessionsByAccount[defaultAccountId]) {
          sessionsByAccount[defaultAccountId] = legacySessions.sessions;
        }

        for (const [accountId, records] of Object.entries(sessionsByAccount)) {
          const activeSessionId = activeSessionIdByAccount[accountId];
          for (const record of records) {
            this.upsertSessionRow(accountId, record, record.sessionId === activeSessionId);
          }
        }
      }

      if (legacyCache) {
        const proposals = { ...(legacyCache.sentProposalsByProjectIdByAccount ?? {}) };
        const hashes = { ...(legacyCache.sentMessageHashesByAccount ?? {}) };
        const defaultAccountId = "default";

        if (legacyCache.sentProposalsByProjectId && !proposals[defaultAccountId]) {
          proposals[defaultAccountId] = legacyCache.sentProposalsByProjectId;
        }
        if (legacyCache.sentMessageHashes && !hashes[defaultAccountId]) {
          hashes[defaultAccountId] = legacyCache.sentMessageHashes;
        }

        for (const [accountId, projectIds] of Object.entries(proposals)) {
          for (const projectId of projectIds) {
            this.insertProposalDedupe(accountId, projectId, nowIso(), true);
          }
        }

        for (const [accountId, messageHashes] of Object.entries(hashes)) {
          for (const messageHash of messageHashes) {
            this.insertMessageDedupe(accountId, messageHash, nowIso(), true);
          }
        }
      }

      this.setMeta("legacy_json_migrated_v1", "true");
    });
    logger.info("db.migration.ok", { filePath: this.filePath });
  }

  private upsertSessionRow(accountId: string, record: SessionRecord, active: boolean): void {
    this.db.prepare(
      `
        INSERT INTO sessions (
          accountId, sessionId, userId, username, lastValidatedAt, updatedAt, cookiesJson, active
        ) VALUES (
          @accountId, @sessionId, @userId, @username, @lastValidatedAt, @updatedAt, @cookiesJson, @active
        )
        ON CONFLICT(accountId, sessionId) DO UPDATE SET
          userId = excluded.userId,
          username = excluded.username,
          lastValidatedAt = excluded.lastValidatedAt,
          updatedAt = excluded.updatedAt,
          cookiesJson = excluded.cookiesJson,
          active = excluded.active
      `,
    ).run({
      accountId,
      sessionId: record.sessionId,
      userId: record.userId ?? null,
      username: record.username ?? null,
      lastValidatedAt: record.lastValidatedAt ?? null,
      updatedAt: record.updatedAt,
      cookiesJson: JSON.stringify(record.cookies ?? []),
      active: active ? 1 : 0,
    });
  }

  private insertProposalDedupe(accountId: string, projectId: number, createdAt: string, skipIfExists = false): void {
    const sql = skipIfExists
      ? "INSERT OR IGNORE INTO proposal_dedupe (accountId, projectId, createdAt) VALUES (?, ?, ?)"
      : "INSERT INTO proposal_dedupe (accountId, projectId, createdAt) VALUES (?, ?, ?)";
    this.db.prepare(sql).run(accountId, projectId, createdAt);
  }

  private insertMessageDedupe(accountId: string, messageHash: string, createdAt: string, skipIfExists = false): void {
    const sql = skipIfExists
      ? "INSERT OR IGNORE INTO message_dedupe (accountId, messageHash, createdAt) VALUES (?, ?, ?)"
      : "INSERT INTO message_dedupe (accountId, messageHash, createdAt) VALUES (?, ?, ?)";
    this.db.prepare(sql).run(accountId, messageHash, createdAt);
  }

  async getActiveSession(accountId: string): Promise<SessionRecord | undefined> {
    await this.ensureInitialized();
    const row = this.db.prepare(
      `
        SELECT sessionId, userId, username, lastValidatedAt, updatedAt, cookiesJson
        FROM sessions
        WHERE accountId = ? AND active = 1
        ORDER BY updatedAt DESC
        LIMIT 1
      `,
    ).get(accountId) as
      | {
          sessionId: string;
          userId?: string | null;
          username?: string | null;
          lastValidatedAt?: string | null;
          updatedAt: string;
          cookiesJson: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      sessionId: row.sessionId,
      userId: row.userId ?? undefined,
      username: row.username ?? undefined,
      lastValidatedAt: row.lastValidatedAt ?? undefined,
      updatedAt: row.updatedAt,
      cookies: JSON.parse(row.cookiesJson) as SessionRecord["cookies"],
    };
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
    await this.ensureInitialized();
    const rows = this.db.prepare(
      `
        SELECT accountId, sessionId, userId, username, lastValidatedAt, updatedAt, cookiesJson, active
        FROM sessions
        ORDER BY accountId ASC, updatedAt DESC
      `,
    ).all() as Array<{
      accountId: string;
      sessionId: string;
      userId?: string | null;
      username?: string | null;
      lastValidatedAt?: string | null;
      updatedAt: string;
      cookiesJson: string;
      active: number;
    }>;

    return rows.map((row) => ({
      accountId: row.accountId,
      sessionId: row.sessionId,
      userId: row.userId ?? undefined,
      username: row.username ?? undefined,
      lastValidatedAt: row.lastValidatedAt ?? undefined,
      updatedAt: row.updatedAt,
      active: row.active === 1,
      cookieNames: (JSON.parse(row.cookiesJson) as Array<{ name?: string }>).map((cookie) => cookie.name).filter((name): name is string => Boolean(name)),
    }));
  }

  async saveSession(accountId: string, record: SessionRecord): Promise<void> {
    await this.ensureInitialized();
    withTransaction(this.db, () => {
      this.db.prepare("UPDATE sessions SET active = 0 WHERE accountId = ?").run(accountId);
      this.upsertSessionRow(accountId, record, true);
    });
  }

  async clearActiveSession(accountId: string): Promise<void> {
    await this.ensureInitialized();
    this.db.prepare("DELETE FROM sessions WHERE accountId = ?").run(accountId);
  }

  async hasProposal(accountId: string, projectId: number): Promise<boolean> {
    await this.ensureInitialized();
    const row = this.db.prepare("SELECT 1 FROM proposal_dedupe WHERE accountId = ? AND projectId = ? LIMIT 1").get(accountId, projectId);
    return Boolean(row);
  }

  async markProposal(accountId: string, projectId: number): Promise<void> {
    await this.ensureInitialized();
    this.insertProposalDedupe(accountId, projectId, nowIso());
  }

  async hasMessageHash(accountId: string, messageHash: string): Promise<boolean> {
    await this.ensureInitialized();
    const row = this.db.prepare("SELECT 1 FROM message_dedupe WHERE accountId = ? AND messageHash = ? LIMIT 1").get(accountId, messageHash);
    return Boolean(row);
  }

  async markMessageHash(accountId: string, messageHash: string): Promise<void> {
    await this.ensureInitialized();
    this.insertMessageDedupe(accountId, messageHash, nowIso());
  }

  async getProposalDailyCount(accountId: string, dayKey: string): Promise<number> {
    await this.ensureInitialized();
    const row = this.db
      .prepare("SELECT sentCount FROM proposal_daily_counter WHERE accountId = ? AND dayKey = ? LIMIT 1")
      .get(accountId, dayKey) as { sentCount?: number } | undefined;
    return row?.sentCount ?? 0;
  }

  async incrementProposalDailyCount(accountId: string, dayKey: string): Promise<number> {
    await this.ensureInitialized();
    let nextCount = 0;
    withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT sentCount FROM proposal_daily_counter WHERE accountId = ? AND dayKey = ? LIMIT 1")
        .get(accountId, dayKey) as { sentCount?: number } | undefined;
      nextCount = (row?.sentCount ?? 0) + 1;
      this.db.prepare(
        `
          INSERT INTO proposal_daily_counter (accountId, dayKey, sentCount, updatedAt)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(accountId, dayKey) DO UPDATE SET
            sentCount = excluded.sentCount,
            updatedAt = excluded.updatedAt
        `,
      ).run(accountId, dayKey, nextCount, nowIso());
    });
    return nextCount;
  }

  async consumeRateLimit(rateKey: string, windowStartMs: number, perMinute: number): Promise<void> {
    await this.ensureInitialized();
    withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT windowStartMs, requestCount FROM rate_limit_windows WHERE rateKey = ? LIMIT 1")
        .get(rateKey) as { windowStartMs?: number; requestCount?: number } | undefined;

      if (!row || row.windowStartMs !== windowStartMs) {
        this.db.prepare(
          `
            INSERT INTO rate_limit_windows (rateKey, windowStartMs, requestCount)
            VALUES (?, ?, 1)
            ON CONFLICT(rateKey) DO UPDATE SET
              windowStartMs = excluded.windowStartMs,
              requestCount = excluded.requestCount
          `,
        ).run(rateKey, windowStartMs);
        return;
      }

      const currentCount = row.requestCount ?? 0;
      if (currentCount >= perMinute) {
        throw new RateLimitError();
      }

      this.db
        .prepare("UPDATE rate_limit_windows SET requestCount = ? WHERE rateKey = ?")
        .run(currentCount + 1, rateKey);
    });
  }

  async appendAudit(event: string, payload?: unknown): Promise<void> {
    await this.ensureInitialized();
    this.db.prepare("INSERT INTO audit_log (ts, event, payloadJson) VALUES (?, ?, ?)").run(
      nowIso(),
      event,
      JSON.stringify(redactValue(payload)),
    );
  }
}
