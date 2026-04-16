const test = require("node:test");
const assert = require("node:assert/strict");

test("interactive login wrapper with injected chromium", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  let opened = "";
  const result = await startInteractiveLoginWith(
    { headless: false, timeoutMs: 1000, browserMode: "launch" },
    {
      chromium: {
        launch: async () => ({
          newContext: async () => ({
            newPage: async () => ({
              goto: async (url) => {
                opened = url;
              },
              evaluate: async () => {
                return {
                  url: "https://www.99freelas.com.br/dashboard",
                  username: "demo_user",
                };
              },
            }),
            storageState: async () => ({
              cookies: [
                {
                  name: "JSESSIONID",
                  value: "abc",
                  domain: ".99freelas.com.br",
                  path: "/",
                  secure: true,
                  expires: -1,
                  httpOnly: true,
                },
              ],
            }),
          }),
          close: async () => {},
        }),
      },
      autoConnectToBrowser: async () => {
        throw new Error("should not attach");
      },
      defaultCdpEndpoints: () => ["http://127.0.0.1:9222"],
      launchChromeWithRemoteDebug: async () => {
        throw new Error("should not launch chrome");
      },
      waitForCdpEndpoint: async () => {
        throw new Error("should not wait for cdp");
      },
      attachToCdpEndpoint: async () => {
        throw new Error("should not attach to cdp");
      },
    },
  );
  assert.match(opened, /\/dashboard$/);
  assert.equal(result.username, "demo_user");
  assert.equal(result.cookies.length, 1);
  assert.equal(result.browserMode, "launch");
});

test("interactive login chrome mode launches real browser and attaches", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  let launched = null;
  let waitedFor = null;
  let attachedEndpoint = null;

  const result = await startInteractiveLoginWith(
    {
      browserMode: "chrome",
      chromeExecutablePath: "chrome.exe",
      chromeUserDataDir: "C:\\temp\\chrome-profile",
      chromePort: 9222,
      timeoutMs: 1000,
    },
    {
      chromium: {
        launch: async () => {
          throw new Error("should not launch playwright");
        },
      },
      launchChromeWithRemoteDebug: async (input) => {
        launched = input;
        return {
          process: { pid: 1234 },
          endpointURL: "http://127.0.0.1:9222",
          port: 9222,
          userDataDir: "C:\\temp\\chrome-profile",
        };
      },
      waitForCdpEndpoint: async (endpointURL) => {
        waitedFor = endpointURL;
        return endpointURL;
      },
      attachToCdpEndpoint: async (endpointURL) => {
        attachedEndpoint = endpointURL;
        return {
          endpointURL,
          browser: { close: async () => {} },
          context: {
            storageState: async () => ({
              cookies: [
                {
                  name: "JSESSIONID",
                  value: "chrome",
                  domain: ".99freelas.com.br",
                  path: "/",
                  secure: true,
                  expires: -1,
                  httpOnly: true,
                },
              ],
            }),
          },
          page: {
            goto: async () => {},
            evaluate: async () => {
              return {
                url: "https://www.99freelas.com.br/dashboard",
                username: "chrome_user",
              };
            },
          },
        };
      },
      autoConnectToBrowser: async () => {
        throw new Error("should not auto attach in chrome mode");
      },
      defaultCdpEndpoints: () => ["http://127.0.0.1:9222"],
    },
  );

  assert.equal(launched.executablePath, "chrome.exe");
  assert.equal(launched.userDataDir, "C:\\temp\\chrome-profile");
  assert.equal(launched.port, 9222);
  assert.equal(waitedFor, "http://127.0.0.1:9222");
  assert.equal(attachedEndpoint, "http://127.0.0.1:9222");
  assert.equal(result.browserMode, "chrome");
  assert.equal(result.cdpEndpointURL, "http://127.0.0.1:9222");
  assert.equal(result.chromeUserDataDir, "C:\\temp\\chrome-profile");
  assert.equal(result.chromePort, 9222);
  assert.equal(result.username, "chrome_user");
});

test("interactive login default wrapper and browser debug wrapper", async () => {
  const playwright = require("playwright");
  const originalLaunch = playwright.chromium.launch;
  let gotoCount = 0;
  playwright.chromium.launch = async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => {
          gotoCount += 1;
        },
        evaluate: async () => ({
          url: "https://www.99freelas.com.br/dashboard",
          username: undefined,
        }),
      }),
      storageState: async () => ({ cookies: [] }),
    }),
    newPage: async () => ({
      goto: async () => {
        gotoCount += 1;
      },
    }),
    close: async () => {},
  });

  try {
    const { startInteractiveLogin } = require("../dist/auth/interactiveLogin.js");
    const { openBrowserForDebug } = require("../dist/clients/browserClient.js");
    await startInteractiveLogin({ headless: true, timeoutMs: 1, browserMode: "launch" });
    await openBrowserForDebug("https://example.com");
    assert.equal(gotoCount >= 2, true);
  } finally {
    playwright.chromium.launch = originalLaunch;
  }
});

test("interactive login default wrapper in attach mode", async () => {
  const playwright = require("playwright");
  const originalConnect = playwright.chromium.connectOverCDP;

  playwright.chromium.connectOverCDP = async () => ({
    contexts: () => [
      {
        pages: () => [
          {
            goto: async () => {},
            evaluate: async () => {
              return {
                url: "https://www.99freelas.com.br/dashboard",
                username: "real_attach_user",
              };
            },
          },
        ],
        newPage: async () => {
          throw new Error("should reuse existing page");
        },
        storageState: async () => ({
          cookies: [
            {
              name: "JSESSIONID",
              value: "real",
              domain: ".99freelas.com.br",
              path: "/",
              secure: true,
              expires: -1,
              httpOnly: true,
            },
          ],
        }),
      },
    ],
  });

  try {
    const { startInteractiveLogin } = require("../dist/auth/interactiveLogin.js");
    const result = await startInteractiveLogin({
      browserMode: "attach",
      cdpEndpointURL: "http://127.0.0.1:9222",
      timeoutMs: 1,
    });
    assert.equal(result.browserMode, "attach");
    assert.equal(result.username, "real_attach_user");
    assert.equal(result.cdpEndpointURL, "http://127.0.0.1:9222");
  } finally {
    playwright.chromium.connectOverCDP = originalConnect;
  }
});
