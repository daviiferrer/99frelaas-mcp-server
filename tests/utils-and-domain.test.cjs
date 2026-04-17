const test = require("node:test");
const assert = require("node:assert/strict");

test("domain errors and result helpers", async () => {
  const { AdapterError, AuthRequiredError, RateLimitError } = require("../dist/domain/errors.js");
  const { ok, fail } = require("../dist/domain/result.js");

  const e = new AdapterError("x", "C1", 400);
  assert.equal(e.code, "C1");
  assert.equal(e.status, 400);
  assert.equal(new AuthRequiredError().code, "AUTH_REQUIRED");
  assert.equal(new RateLimitError().status, 429);

  assert.deepEqual(ok({ a: 1 }), { ok: true, data: { a: 1 } });
  assert.deepEqual(fail("E", "m", 500), {
    ok: false,
    error: { code: "E", message: "m", status: 500 },
  });
});

test("time and text helpers", async () => {
  const { nowIso, startOfDayIso } = require("../dist/utils/time.js");
  const { sha256Hex } = require("../dist/utils/text.js");
  const n = nowIso();
  const d = startOfDayIso();
  assert.match(n, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(d, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
  assert.equal(sha256Hex("abc").length, 64);
});

test("redact and encrypt", async () => {
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
  const { redactValue } = require("../dist/security/redact.js");
  const { encryptText, decryptText } = require("../dist/security/encrypt.js");
  const redacted = redactValue({
    cookies: "123",
    nested: { authorization: "x", visible: "ok" },
    arr: [{ token: "t" }],
  });
  assert.equal(redacted.cookies, "[REDACTED]");
  assert.equal(redacted.nested.authorization, "[REDACTED]");
  assert.equal(redacted.nested.visible, "ok");
  assert.equal(redacted.arr[0].token, "[REDACTED]");

  const cipher = encryptText("hello");
  assert.notEqual(cipher, "hello");
  assert.equal(decryptText(cipher), "hello");
});

test("rate limiter", async () => {
  const { RateLimiter } = require("../dist/security/rateLimiter.js");
  const limiter = new RateLimiter(2);
  limiter.consume("k");
  limiter.consume("k");
  assert.throws(() => limiter.consume("k"));
});

test("skills catalog helpers", async () => {
  const {
    loadSkillCatalog,
    getSkillById,
    getCuratedSkillStacks,
    validateSkillIds,
    assertValidSkillIds,
    getSkillCatalogIndexResourceJson,
    getSkillCatalogPage,
    getSkillCatalogPageResourceJson,
    getSkillStacksResourceMarkdown,
    getSkillSelectionGuideMarkdown,
  } = require("../dist/domain/skillsCatalog.js");

  const catalog = loadSkillCatalog();
  assert.equal(catalog.length > 1000, true);
  assert.equal(catalog.some((entry) => entry.value === 2057), true);
  assert.equal(loadSkillCatalog().length, catalog.length);
  const defaultCatalogPath = `${process.cwd()}\\data\\99freelas-skills-catalog.json`;
  assert.equal(loadSkillCatalog(["C:\\definitely-missing.json", defaultCatalogPath]).length, catalog.length);
  assert.throws(() => loadSkillCatalog(["C:\\definitely-missing.json"]));
  assert.equal(getSkillById(2057).text, "Typescript");

  const stacks = getCuratedSkillStacks();
  assert.equal(stacks.some((stack) => stack.key === "backend-api"), true);
  assert.equal(stacks.every((stack) => Array.isArray(stack.skills)), true);

  const normalized = validateSkillIds([960, 1282, 1282, 2057]);
  assert.deepEqual(normalized.normalized, [960, 1282, 2057]);
  assert.deepEqual(normalized.invalidSkillIds, []);
  assert.deepEqual(assertValidSkillIds([960, 1282]), [960, 1282]);
  assert.throws(() => assertValidSkillIds([999999]));

  const page = getSkillCatalogPage({ limit: 3 });
  assert.equal(page.items.length, 3);
  assert.equal(page.hasMore, true);
  assert.match(getSkillCatalogIndexResourceJson(), /curatedStacks/);
  assert.match(getSkillCatalogPageResourceJson({ query: "docker", limit: 5 }), /Docker/);
  assert.match(getSkillStacksResourceMarkdown(), /Curated Skill Stacks/);
  assert.match(getSkillSelectionGuideMarkdown(), /Keep the profile focused/);
});

test("authenticated username parser", async () => {
  const { extractAuthenticatedUsernameFromHtml } = require("../dist/parsers/authIdentityParser.js");

  const html = '<a href="/user/carlos-vieira-mkt">Meu perfil</a>';
  assert.equal(extractAuthenticatedUsernameFromHtml(html), "carlos-vieira-mkt");
  assert.equal(extractAuthenticatedUsernameFromHtml("<div>sem link</div>"), undefined);
});
