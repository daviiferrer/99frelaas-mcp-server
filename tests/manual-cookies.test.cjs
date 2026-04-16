const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

test("manual cookies parse and load", async () => {
  delete require.cache[require.resolve("../dist/auth/manualCookies.js")];
  const {
    parseManualCookies,
    loadManualCookiesFromFile,
    getDefaultManualCookiesFile,
    getDefaultBaseUrl,
  } = require("../dist/auth/manualCookies.js");

  assert.throws(() => parseManualCookies({ nope: true }), /JSON array or an object with a cookies array/);
  assert.throws(() => parseManualCookies([{ name: "x" }]), /No valid cookies/);

  const cookies = parseManualCookies([
    {
      name: "kmlicn",
      value: "abc",
      domain: "www.99freelas.com.br",
      secure: true,
      httpOnly: true,
    },
  ]);
  assert.equal(cookies[0].path, "/");
  assert.equal(getDefaultBaseUrl(), "https://www.99freelas.com.br");
  assert.match(getDefaultManualCookiesFile(), /manual-cookies\.json/);

  const wrapped = parseManualCookies({
    cookies: [
      {
        name: "kmlicn",
        value: "abc",
        domain: "www.99freelas.com.br",
      },
    ],
  });
  assert.equal(wrapped[0].name, "kmlicn");

  const dir = await mkdtemp(join(tmpdir(), "manual-cookies-"));
  const filePath = join(dir, "cookies.json");
  await writeFile(filePath, JSON.stringify([{ name: "sgcn", value: "1", domain: "www.99freelas.com.br" }]), "utf8");
  const loaded = await loadManualCookiesFromFile(filePath);
  assert.equal(loaded[0].name, "sgcn");
});
