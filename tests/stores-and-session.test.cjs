const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

let tempDir = "";

test.beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mcp99-"));
  process.env.STATE_DB_FILE = join(tempDir, "state.sqlite");
  process.env.SESSION_FILE = join(tempDir, "sessions.json");
  process.env.CACHE_FILE = join(tempDir, "cache.json");
  process.env.AUDIT_LOG_FILE = join(tempDir, "audit.log");
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString("base64");
});

test.afterEach(async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  StateDatabase.closeAll();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  delete process.env.STATE_DB_FILE;
  delete process.env.SESSION_FILE;
  delete process.env.CACHE_FILE;
  delete process.env.AUDIT_LOG_FILE;
  delete process.env.SESSION_ENCRYPTION_KEY_BASE64;
});

test("session store save/get/clear", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const store = new SessionStore();
  await store.save({
    sessionId: "s1",
    updatedAt: new Date().toISOString(),
    cookies: [],
  }, "acc_store");
  const active = await store.getActive("acc_store");
  assert.equal(active.sessionId, "s1");
  await store.clearActive("acc_store");
  const after = await store.getActive("acc_store");
  assert.equal(after, undefined);
});

test("session store isolates active session by accountId", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const store = new SessionStore();
  await store.save({
    sessionId: "acc1_s1",
    updatedAt: new Date().toISOString(),
    cookies: [],
  }, "acc_1");
  await store.save({
    sessionId: "acc2_s1",
    updatedAt: new Date().toISOString(),
    cookies: [],
  }, "acc_2");
  const acc1 = await store.getActive("acc_1");
  const acc2 = await store.getActive("acc_2");
  assert.equal(acc1.sessionId, "acc1_s1");
  assert.equal(acc2.sessionId, "acc2_s1");
});

test("cache store dedup markers", async () => {
  const { CacheStore } = require("../dist/storage/cacheStore.js");
  const store = new CacheStore();
  assert.equal(await store.hasProposal(1), false);
  await store.markProposal(1);
  assert.equal(await store.hasProposal(1), true);
  assert.equal(await store.hasMessageHash("h1"), false);
  await store.markMessageHash("h1");
  assert.equal(await store.hasMessageHash("h1"), true);
});

test("cache store isolates dedup markers by accountId", async () => {
  const { CacheStore } = require("../dist/storage/cacheStore.js");
  const store = new CacheStore();
  await store.markProposal(7, "acc_1");
  await store.markMessageHash("m_hash", "acc_1");
  assert.equal(await store.hasProposal(7, "acc_1"), true);
  assert.equal(await store.hasProposal(7, "acc_2"), false);
  assert.equal(await store.hasMessageHash("m_hash", "acc_1"), true);
  assert.equal(await store.hasMessageHash("m_hash", "acc_2"), false);
});

test("cache store persists proposal daily counters by account", async () => {
  const { CacheStore } = require("../dist/storage/cacheStore.js");
  const store = new CacheStore();
  const dayKey = "2026-04-17";
  assert.equal(await store.getDailyProposalCount(dayKey, "acc_1"), 0);
  assert.equal(await store.incrementDailyProposalCount(dayKey, "acc_1"), 1);
  assert.equal(await store.incrementDailyProposalCount(dayKey, "acc_1"), 2);
  assert.equal(await store.getDailyProposalCount(dayKey, "acc_1"), 2);
  assert.equal(await store.getDailyProposalCount(dayKey, "acc_2"), 0);
});

test("cache store enforces persistent rate-limit windows", async () => {
  const { CacheStore } = require("../dist/storage/cacheStore.js");
  const store = new CacheStore();
  await store.consumeRateLimit("acc_1:projects_list", 2);
  await store.consumeRateLimit("acc_1:projects_list", 2);
  await assert.rejects(() => store.consumeRateLimit("acc_1:projects_list", 2), /Rate limit exceeded/);
});

test("cookie store and session manager", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const { CookieStore } = require("../dist/auth/cookieStore.js");
  const { SessionManager } = require("../dist/auth/sessionManager.js");
  const cookieStore = new CookieStore();
  const manager = new SessionManager(new SessionStore(), cookieStore);

  await manager.createOrUpdateSession({
    userId: "1",
    username: "u",
    cookies: [{ name: "JSESSIONID", value: "v", domain: ".99freelas.com.br", path: "/" }],
  });

  const state = await manager.checkSession("u");
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.userId, "1");
  assert.equal(state.username, "u");
  assert.ok(state.sessionId);
  assert.deepEqual(await manager.requireCookies("u"), [
    { name: "JSESSIONID", value: "v", domain: ".99freelas.com.br", path: "/", expires: undefined, secure: undefined, httpOnly: undefined },
  ]);

  await manager.clearSession("u");
  await assert.rejects(() => manager.requireCookies("u"));
});

test("session manager stores username by accountId", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const { CookieStore } = require("../dist/auth/cookieStore.js");
  const { SessionManager } = require("../dist/auth/sessionManager.js");
  const manager = new SessionManager(new SessionStore(), new CookieStore());

  await manager.createOrUpdateSession({
    accountId: "acc_identified",
    userId: "42",
    username: "carlos-vieira-mkt",
    cookies: [{ name: "JSESSIONID", value: "v", domain: ".99freelas.com.br", path: "/" }],
  });

  const session = await manager.checkSession("acc_identified");
  assert.equal(session.username, "carlos-vieira-mkt");
});

test("session manager isolates by accountId", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const { CookieStore } = require("../dist/auth/cookieStore.js");
  const { SessionManager } = require("../dist/auth/sessionManager.js");
  const cookieStore = new CookieStore();
  const manager = new SessionManager(new SessionStore(), cookieStore);

  await manager.createOrUpdateSession({
    accountId: "acc_1",
    userId: "u1",
    username: "user_1",
    cookies: [{ name: "JSESSIONID", value: "a1", domain: ".99freelas.com.br", path: "/" }],
  });
  await manager.createOrUpdateSession({
    accountId: "acc_2",
    userId: "u2",
    username: "user_2",
    cookies: [{ name: "JSESSIONID", value: "a2", domain: ".99freelas.com.br", path: "/" }],
  });

  const acc1 = await manager.checkSession("acc_1");
  const acc2 = await manager.checkSession("acc_2");
  assert.equal(acc1.username, "user_1");
  assert.equal(acc2.username, "user_2");
  assert.equal((await manager.requireCookies("acc_1"))[0].value, "a1");
  assert.equal((await manager.requireCookies("acc_2"))[0].value, "a2");
});

test("session manager clears expired cookies automatically", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const { CookieStore } = require("../dist/auth/cookieStore.js");
  const { SessionManager } = require("../dist/auth/sessionManager.js");
  const manager = new SessionManager(new SessionStore(), new CookieStore());
  const expiredAt = Math.floor(Date.now() / 1000) - 10;

  await manager.createOrUpdateSession({
    accountId: "expired_acc",
    userId: "u-expired",
    username: "expired-user",
    cookies: [{ name: "JSESSIONID", value: "old", domain: ".99freelas.com.br", path: "/", expires: expiredAt }],
  });

  await assert.rejects(() => manager.requireCookies("expired_acc"), /cookies expired/i);
  const state = await manager.checkSession("expired_acc");
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.cookiesPresent.length, 0);
});

test("session store migrates legacy single-account file", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  await writeFile(
    process.env.SESSION_FILE,
    JSON.stringify({
      activeSessionId: "legacy_s1",
      sessions: [{ sessionId: "legacy_s1", updatedAt: new Date().toISOString(), cookies: [] }],
    }),
    "utf8",
  );
  const store = new SessionStore();
  const active = await store.getActive("default");
  assert.equal(active.sessionId, "legacy_s1");
});

test("cache store migrates legacy single-account file", async () => {
  const { CacheStore } = require("../dist/storage/cacheStore.js");
  await writeFile(
    process.env.CACHE_FILE,
    JSON.stringify({
      sentProposalsByProjectId: [91],
      sentMessageHashes: ["legacy_hash"],
    }),
    "utf8",
  );
  const store = new CacheStore();
  assert.equal(await store.hasProposal(91), true);
  assert.equal(await store.hasMessageHash("legacy_hash"), true);
});

test("audit log store writes", async () => {
  const { DatabaseSync } = require("node:sqlite");
  const { AuditLogStore } = require("../dist/storage/auditLogStore.js");
  const store = new AuditLogStore();
  await store.append("evt", { token: "secret", x: 1 });
  const db = new DatabaseSync(process.env.STATE_DB_FILE);
  const row = db.prepare("SELECT event, payloadJson FROM audit_log ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.event, "evt");
  assert.match(row.payloadJson, /\[REDACTED\]/);
  db.close();
});

test("state database tolerates invalid legacy files and reuses cached instance", async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  await writeFile(process.env.SESSION_FILE, "{not-json", "utf8");
  await writeFile(process.env.CACHE_FILE, "{not-json", "utf8");
  const db1 = await StateDatabase.open();
  const db2 = await StateDatabase.open();
  assert.equal(db1, db2);
  StateDatabase.closeAll();
});

test("state database rollback and migration skip branches", async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  const db1 = await StateDatabase.open();
  await assert.rejects(async () => {
    const original = db1.upsertSessionRow;
    db1.upsertSessionRow = () => {
      throw new Error("boom");
    };
    try {
      await db1.saveSession("rollback_account", {
        sessionId: "rollback_session",
        updatedAt: new Date().toISOString(),
        cookies: [],
      });
    } finally {
      db1.upsertSessionRow = original;
    }
  }, /boom/);

  StateDatabase.closeAll();
  const db2 = await StateDatabase.open();
  assert.ok(db2);
  StateDatabase.closeAll();
});

test("state database explicit path cache hit and readFile catch branch", async () => {
  const { StateDatabase } = require("../dist/storage/stateDatabase.js");
  const fsPromises = require("node:fs/promises");
  const originalReadFile = fsPromises.readFile;
  const explicitPath = join(tempDir, "explicit-state.sqlite");
  fsPromises.readFile = async () => {
    throw new Error("boom");
  };

  try {
    const db1 = await StateDatabase.open(explicitPath);
    const db2 = await StateDatabase.open(explicitPath);
    assert.equal(db1, db2);
    StateDatabase.closeAll();
  } finally {
    fsPromises.readFile = originalReadFile;
  }
});

test("logger writes audit log file", async () => {
  const { readFile } = require("node:fs/promises");
  process.env.AUDIT_LOG_FILE = join(tempDir, "plain-audit.log");
  const { logAudit } = require("../dist/utils/logger.js");
  await logAudit("evt", { token: "secret", value: 1 });
  const content = await readFile(process.env.AUDIT_LOG_FILE, "utf8");
  assert.match(content, /evt/);
  assert.match(content, /\[REDACTED\]/);
});
