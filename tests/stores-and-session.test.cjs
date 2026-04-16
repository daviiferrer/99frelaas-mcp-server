const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

let tempDir = "";

test.beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mcp99-"));
  process.env.SESSION_FILE = join(tempDir, "sessions.json");
  process.env.CACHE_FILE = join(tempDir, "cache.json");
  process.env.AUDIT_LOG_FILE = join(tempDir, "audit.log");
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString("base64");
});

test.afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test("session store save/get/clear", async () => {
  const { SessionStore } = require("../dist/storage/sessionStore.js");
  const store = new SessionStore();
  await store.save({
    sessionId: "s1",
    updatedAt: new Date().toISOString(),
    cookies: [],
  });
  const active = await store.getActive();
  assert.equal(active.sessionId, "s1");
  await store.clearActive();
  const after = await store.getActive();
  assert.equal(after, undefined);
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

  const state = await manager.checkSession();
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.userId, "1");
  assert.equal(state.username, "u");
  assert.ok(state.sessionId);
  assert.deepEqual(await manager.requireCookies(), [
    { name: "JSESSIONID", value: "v", domain: ".99freelas.com.br", path: "/", expires: undefined, secure: undefined, httpOnly: undefined },
  ]);

  await manager.clearSession();
  await assert.rejects(() => manager.requireCookies());
});

test("audit log store writes", async () => {
  const { readFile } = require("node:fs/promises");
  const { AuditLogStore } = require("../dist/storage/auditLogStore.js");
  const store = new AuditLogStore();
  await store.append("evt", { token: "secret", x: 1 });
  const content = await readFile(process.env.AUDIT_LOG_FILE, "utf8");
  assert.match(content, /evt/);
  assert.match(content, /\[REDACTED\]/);
});
