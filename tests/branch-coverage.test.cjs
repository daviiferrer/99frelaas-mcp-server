const test = require("node:test");
const assert = require("node:assert/strict");

test("load type-export modules", async () => {
  assert.ok(require("../dist/auth/authTypes.js"));
  assert.ok(require("../dist/domain/models.js"));
});

test("encrypt throws on invalid key", async () => {
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = "invalid";
  const { encryptText } = require("../dist/security/encrypt.js");
  assert.throws(() => encryptText("x"), /32 bytes/);
});

test("response parser empty payload", async () => {
  const { safeJson } = require("../dist/parsers/responseParser.js");
  const value = await safeJson({
    headers: { get: () => "application/json; charset=utf-8" },
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  assert.equal(value, undefined);
});

test("project parsers branch fallbacks", async () => {
  const { parseProjectListHtml } = require("../dist/parsers/projectListParser.js");
  const { parseProjectDetailHtml } = require("../dist/parsers/projectDetailParser.js");

  const list = parseProjectListHtml(
    `<a href="https://www.99freelas.com.br/project/sem-id">T</a><p>S</p>`,
    "cat",
    1,
  );
  assert.equal(list.length, 0);

  const detail = parseProjectDetailHtml("<div>sem estrutura</div>", {
    projectId: 1,
    title: "t",
    url: "u",
    tags: [],
  });
  assert.equal(detail.description, "");
  assert.equal(detail.bidUrl, undefined);
  assert.equal(detail.connectionsCost, undefined);
});

test("http client handles no and malformed set-cookie", async () => {
  const { HttpClient } = require("../dist/clients/httpClient.js");
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (_url, _init) => {
    const next = calls.shift();
    return next;
  };
  try {
    const client = new HttpClient("https://www.99freelas.com.br");
    calls.push({
      ok: true,
      url: "https://www.99freelas.com.br/a",
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await client.request("/a");

    calls.push({
      ok: true,
      url: "https://www.99freelas.com.br/b",
      headers: { get: () => "malformed" },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await client.request("/b");
  } finally {
    global.fetch = originalFetch;
  }
});

test("cookie store default path branch", async () => {
  process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 3).toString("base64");
  const { CookieStore } = require("../dist/auth/cookieStore.js");
  const store = new CookieStore();
  const out = store.toStored([{ name: "n", value: "v", domain: ".x" }]);
  assert.equal(out[0].path, "/");
});

test("session manager unauthenticated state", async () => {
  const { mkdtemp } = require("node:fs/promises");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const originalKey = process.env.SESSION_ENCRYPTION_KEY_BASE64;
  const originalStateDb = process.env.STATE_DB_FILE;
  const originalSessionFile = process.env.SESSION_FILE;
  const tmpDbDir = await mkdtemp(join(tmpdir(), "mcp99-"));
  const tmpSessionDir = await mkdtemp(join(tmpdir(), "mcp99-"));

  try {
    process.env.SESSION_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 8).toString("base64");
    process.env.STATE_DB_FILE = join(tmpDbDir, "state.sqlite");
    process.env.SESSION_FILE = join(tmpSessionDir, "sessions.json");
    const { SessionStore } = require("../dist/storage/sessionStore.js");
    const { CookieStore } = require("../dist/auth/cookieStore.js");
    const { SessionManager } = require("../dist/auth/sessionManager.js");
    const manager = new SessionManager(new SessionStore(), new CookieStore());
    const state = await manager.checkSession();
    assert.equal(state.isAuthenticated, false);
  } finally {
    const { StateDatabase } = require("../dist/storage/stateDatabase.js");
    StateDatabase.closeAll();
    process.env.SESSION_ENCRYPTION_KEY_BASE64 = originalKey;
    process.env.STATE_DB_FILE = originalStateDb;
    process.env.SESSION_FILE = originalSessionFile;
  }
});

test("interactive login default values and matcher branches", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  let receivedHeadless = null;
  await startInteractiveLoginWith(
    { browserMode: "launch" },
    {
      chromium: {
        launch: async ({ headless }) => {
          receivedHeadless = headless;
          return {
            newContext: async () => ({
              newPage: async () => ({
                goto: async () => {},
                evaluate: async () => ({
                  url: "https://www.99freelas.com.br/dashboard",
                  username: undefined,
                }),
              }),
              storageState: async () => ({ cookies: [] }),
            }),
            close: async () => {},
          };
        },
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
  assert.equal(receivedHeadless, false);
});

test("interactive login default chrome mode", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  let launched = false;
  let waited = false;
  const result = await startInteractiveLoginWith(
    { timeoutMs: 500 },
    {
      chromium: {
        launch: async () => {
          throw new Error("should not use playwright launch in chrome mode");
        },
      },
      launchChromeWithRemoteDebug: async () => ({
        process: { pid: 1 },
        endpointURL: "http://127.0.0.1:9222",
        port: 9222,
        userDataDir: "C:\\temp\\chrome-profile",
      }),
      waitForCdpEndpoint: async (endpointURL) => {
        waited = endpointURL === "http://127.0.0.1:9222";
        return endpointURL;
      },
      attachToCdpEndpoint: async (endpointURL) => ({
        endpointURL,
        browser: { close: async () => {} },
        context: {
          storageState: async () => ({ cookies: [] }),
        },
        page: {
          goto: async () => {},
          evaluate: async () => ({
            url: "https://www.99freelas.com.br/dashboard",
            username: undefined,
          }),
        },
      }),
      autoConnectToBrowser: async () => {
        launched = true;
        throw new Error("should not attach");
      },
      defaultCdpEndpoints: () => ["http://127.0.0.1:9222"],
    },
  );
  assert.equal(launched, false);
  assert.equal(waited, true);
  assert.equal(result.browserMode, "chrome");
});

test("interactive login attach mode uses cdp browser", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  let gotoUrl = "";
  const result = await startInteractiveLoginWith(
    { browserMode: "attach", cdpEndpointURL: "http://127.0.0.1:9222", timeoutMs: 500 },
    {
      chromium: {
        launch: async () => {
          throw new Error("should not launch");
        },
      },
      autoConnectToBrowser: async (endpoints) => ({
        endpointURL: endpoints[0],
        browser: { close: async () => {} },
        context: {
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
        },
        page: {
          goto: async (url) => {
            gotoUrl = url;
          },
          evaluate: async () => {
            return {
              url: "https://www.99freelas.com.br/dashboard",
              username: "attach_user",
            };
          },
        },
      }),
      defaultCdpEndpoints: () => ["http://127.0.0.1:9222"],
    },
  );
  assert.match(gotoUrl, /\/dashboard$/);
  assert.equal(result.browserMode, "attach");
  assert.equal(result.cdpEndpointURL, "http://127.0.0.1:9222");
  assert.equal(result.username, "attach_user");
});

test("projects and proposals extra branches", async () => {
  const { ProjectsAdapter } = require("../dist/adapters/projectsAdapter.js");
  const { ProposalsAdapter } = require("../dist/adapters/proposalsAdapter.js");

  const pHttp = {
    async request() {
      return {
        headers: { get: () => "text/html; charset=utf-8" },
        arrayBuffer: async () => new TextEncoder().encode("nada aqui").buffer,
      };
    },
  };
  const pa = new ProjectsAdapter(pHttp);
  const bid = await pa.getBidContext({ projectId: 1 });
  assert.equal(bid.flags.supportsPromote, false);

  const prHttp = {
    async request() {
      return {
        ok: true,
        headers: { get: () => "application/json; charset=utf-8" },
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ status: { id: 1 }, directResult: false })).buffer,
      };
    },
  };
  const pra = new ProposalsAdapter(prHttp);
  const sent = await pra.send({
    projectId: 2,
    offerCents: 10000,
    durationDays: 2,
    proposalText: "texto de proposta suficiente",
  });
  assert.equal(sent.responseStatusId, 1);
});

test("cdp browser helpers", async () => {
  const playwright = require("playwright");
  const originalConnect = playwright.chromium.connectOverCDP;
  let newPageCalls = 0;

  playwright.chromium.connectOverCDP = async () => ({
    contexts: () => [
      {
        pages: () => [],
        newPage: async () => {
          newPageCalls += 1;
          return {
            goto: async () => {},
            evaluate: async () => ({
              url: "https://www.99freelas.com.br/dashboard",
              username: undefined,
            }),
          };
        },
        storageState: async () => ({ cookies: [] }),
      },
    ],
  });

  try {
    const {
      connectToExistingBrowser,
      autoConnectToBrowser,
      defaultCdpEndpoints,
    } = require("../dist/auth/cdpBrowser.js");

    const endpoints = defaultCdpEndpoints([9222, 9223]);
    assert.deepEqual(endpoints, ["http://127.0.0.1:9222", "http://127.0.0.1:9223"]);

    const connected = await connectToExistingBrowser("http://127.0.0.1:9222");
    assert.equal(typeof connected.page.goto, "function");
    assert.equal(newPageCalls, 1);
    await connected.browser.close();

    const auto = await autoConnectToBrowser(["http://127.0.0.1:9222"]);
    assert.equal(auto.endpointURL, "http://127.0.0.1:9222");
  } finally {
    playwright.chromium.connectOverCDP = originalConnect;
  }
});

test("cdp browser helper errors", async () => {
  const playwright = require("playwright");
  const originalConnect = playwright.chromium.connectOverCDP;
  let mode = "no-context";

  playwright.chromium.connectOverCDP = async () => {
    if (mode === "no-context") {
      return {
        close: async () => {},
        contexts: () => [],
      };
    }

    throw new Error("connection failed");
  };

  try {
    const {
      connectToExistingBrowser,
      autoConnectToBrowser,
    } = require("../dist/auth/cdpBrowser.js");

    await assert.rejects(
      () => connectToExistingBrowser("http://127.0.0.1:9222"),
      /No browser context available/,
    );

    mode = "fail-all";
    await assert.rejects(
      () => autoConnectToBrowser(["http://127.0.0.1:9222", "http://127.0.0.1:9223"]),
      /Could not attach to an existing Chromium browser over CDP/,
    );
  } finally {
    playwright.chromium.connectOverCDP = originalConnect;
  }
});

test("chrome launcher and cdp wait helper", async () => {
  const childProcess = require("node:child_process");
  const fs = require("node:fs");
  const playwright = require("playwright");
  const originalSpawn = childProcess.spawn;
  const originalExistsSync = fs.existsSync;
  const originalConnect = playwright.chromium.connectOverCDP;
  const originalFetch = global.fetch;
  const originalChromePath = process.env.CHROME_EXECUTABLE_PATH;
  const originalChromePort = process.env.CHROME_REMOTE_DEBUG_PORT;
  const originalChromeUserDataDir = process.env.CHROME_USER_DATA_DIR;

  let spawnArgs = null;
  childProcess.spawn = (cmd, args, options) => {
    spawnArgs = { cmd, args, options };
    return { unref: () => {}, pid: 1234 };
  };
  process.env.CHROME_EXECUTABLE_PATH = process.execPath;
  process.env.CHROME_REMOTE_DEBUG_PORT = "9333";
  process.env.CHROME_USER_DATA_DIR = "C:\\temp\\chrome-profile-test";
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}) ,
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ webSocketDebuggerUrl: "ws://127.0.0.1:9333/devtools/browser/test" }),
    };
  };
  playwright.chromium.connectOverCDP = async () => ({
    contexts: () => [
      {
        pages: () => [],
        newPage: async () => ({
          goto: async () => {},
          evaluate: async () => ({
            url: "https://www.99freelas.com.br/dashboard",
            username: undefined,
          }),
        }),
        storageState: async () => ({ cookies: [] }),
      },
    ],
  });

  try {
    delete require.cache[require.resolve("../dist/auth/chromeLauncher.js")];
    delete require.cache[require.resolve("../dist/auth/cdpBrowser.js")];
    const { launchChromeWithRemoteDebug } = require("../dist/auth/chromeLauncher.js");
    const { waitForCdpEndpoint, attachToCdpEndpoint } = require("../dist/auth/cdpBrowser.js");

    const launched = await launchChromeWithRemoteDebug();
    assert.equal(launched.endpointURL, "http://127.0.0.1:9333");
    assert.match(spawnArgs.cmd.toLowerCase(), /node|chrome|edge/);
    assert.ok(spawnArgs.args.some((arg) => String(arg).includes("--remote-debugging-port=9333")));
    assert.ok(spawnArgs.args.some((arg) => String(arg).includes("C:\\temp\\chrome-profile-test")));

    const waited = await waitForCdpEndpoint("http://127.0.0.1:9333", 1000);
    assert.equal(waited, "http://127.0.0.1:9333");

    const attached = await attachToCdpEndpoint("http://127.0.0.1:9333");
    assert.equal(attached.endpointURL, "http://127.0.0.1:9333");

    global.fetch = async () => {
      throw new Error("network down");
    };
    await assert.rejects(
      () => waitForCdpEndpoint("http://127.0.0.1:9334", 10),
      /Timed out waiting for CDP endpoint/,
    );

    process.env.CHROME_REMOTE_DEBUG_PORT = "";
    const launchedFreePort = await launchChromeWithRemoteDebug({
      executablePath: process.execPath,
      userDataDir: "C:\\temp\\chrome-profile-freeport",
    });
    assert.match(launchedFreePort.endpointURL, /^http:\/\/127\.0\.0\.1:\d+$/);

    fs.existsSync = () => false;
    delete require.cache[require.resolve("../dist/auth/chromeLauncher.js")];
    const { launchChromeWithRemoteDebug: launchMissing } = require("../dist/auth/chromeLauncher.js");
    await assert.rejects(
      () => launchMissing({ executablePath: undefined }),
      /CHROME_EXECUTABLE_PATH is not set/,
    );
  } finally {
    childProcess.spawn = originalSpawn;
    fs.existsSync = originalExistsSync;
    playwright.chromium.connectOverCDP = originalConnect;
    global.fetch = originalFetch;
    process.env.CHROME_EXECUTABLE_PATH = originalChromePath;
    process.env.CHROME_REMOTE_DEBUG_PORT = originalChromePort;
    process.env.CHROME_USER_DATA_DIR = originalChromeUserDataDir;
  }
});

test("interactive login attach mode polls until authenticated", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  const timers = require("node:timers/promises");
  const originalSleep = timers.setTimeout;
  const originalDocument = global.document;
  const originalWindow = global.window;
  const visited = [];
  let snapshots = 0;

  timers.setTimeout = async () => {};

  try {
    const result = await startInteractiveLoginWith(
      {
        browserMode: "attach",
        cdpEndpointURL: "http://127.0.0.1:9222",
        timeoutMs: 25,
      },
      {
        chromium: {
          launch: async () => {
            throw new Error("should not launch playwright");
          },
        },
        autoConnectToBrowser: async () => ({
          endpointURL: "http://127.0.0.1:9222",
          browser: { close: async () => {} },
          context: {
            storageState: async () => ({
              cookies: [
                {
                  name: "JSESSIONID",
                  value: "attached",
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
            goto: async (url) => {
              visited.push(url);
            },
            evaluate: async (fn) => {
              snapshots += 1;
              global.window = {
                location: {
                  href:
                    snapshots >= 2
                      ? "https://www.99freelas.com.br/dashboard"
                      : "https://www.99freelas.com.br/login",
                },
              };
              global.document = {
                querySelector: (selector) =>
                  snapshots >= 2 && selector === ".user-name"
                    ? { textContent: "polled_attach_user" }
                    : null,
              };
              return fn();
            },
          },
        }),
        defaultCdpEndpoints: () => ["http://127.0.0.1:9222"],
        launchChromeWithRemoteDebug: async () => {
          throw new Error("should not launch chrome");
        },
        waitForCdpEndpoint: async () => {
          throw new Error("should not wait for cdp");
        },
        attachToCdpEndpoint: async () => {
          throw new Error("should not attach directly");
        },
      },
    );

    assert.deepEqual(visited, [
      "https://www.99freelas.com.br/dashboard",
      "https://www.99freelas.com.br/login",
    ]);
    assert.equal(result.username, "polled_attach_user");
    assert.equal(result.cookies[0].name, "JSESSIONID");
  } finally {
    timers.setTimeout = originalSleep;
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

test("interactive login attach mode times out with diagnostics", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  const timers = require("node:timers/promises");
  const originalSleep = timers.setTimeout;
  const originalDateNow = Date.now;
  const originalDocument = global.document;
  const originalWindow = global.window;
  let nowCall = 0;
  let closed = false;

  timers.setTimeout = async () => {};
  Date.now = () => {
    nowCall += 1;
    if (nowCall === 1) return 0;
    if (nowCall === 2) return 0;
    return 10;
  };

  try {
    await assert.rejects(
      () =>
        startInteractiveLoginWith(
          {
            browserMode: "attach",
            cdpEndpointURL: "http://127.0.0.1:9222",
            timeoutMs: 1,
          },
          {
            chromium: {
              launch: async () => {
                throw new Error("should not launch");
              },
            },
            autoConnectToBrowser: async () => ({
              endpointURL: "http://127.0.0.1:9222",
              browser: {
                close: async () => {
                  closed = true;
                },
              },
              context: {
                storageState: async () => ({
                  cookies: [
                    {
                      name: "JSESSIONID",
                      value: "timeout",
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
                evaluate: async (fn) => {
                  global.window = { location: { href: "https://www.99freelas.com.br/login" } };
                  global.document = { querySelector: () => null };
                  return fn();
                },
              },
            }),
            defaultCdpEndpoints: () => ["http://127.0.0.1:9222"],
            launchChromeWithRemoteDebug: async () => {
              throw new Error("should not launch chrome");
            },
            waitForCdpEndpoint: async () => {
              throw new Error("should not wait for cdp");
            },
            attachToCdpEndpoint: async () => {
              throw new Error("should not attach directly");
            },
          },
        ),
      /Timed out waiting for authenticated 99Freelas session.*JSESSIONID/,
    );
    assert.equal(closed, true);
  } finally {
    timers.setTimeout = originalSleep;
    Date.now = originalDateNow;
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

test("interactive login launch mode times out with diagnostics", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  const timers = require("node:timers/promises");
  const originalSleep = timers.setTimeout;
  const originalDateNow = Date.now;
  const originalDocument = global.document;
  const originalWindow = global.window;
  let nowCall = 0;
  let browserClosed = false;

  timers.setTimeout = async () => {};
  Date.now = () => {
    nowCall += 1;
    if (nowCall === 1) return 0;
    if (nowCall === 2) return 0;
    return 10;
  };

  try {
    await assert.rejects(
      () =>
        startInteractiveLoginWith(
          {
            browserMode: "launch",
            timeoutMs: 1,
          },
          {
            chromium: {
              launch: async () => ({
                newContext: async () => ({
                  newPage: async () => ({
                    goto: async () => {},
                    evaluate: async (fn) => {
                      global.window = { location: { href: "https://www.99freelas.com.br/login" } };
                      global.document = { querySelector: () => null };
                      return fn();
                    },
                  }),
                  storageState: async () => ({
                    cookies: [
                      {
                        name: "kmlicn",
                        value: "timeout",
                        domain: ".99freelas.com.br",
                        path: "/",
                        secure: true,
                        expires: -1,
                        httpOnly: false,
                      },
                    ],
                  }),
                }),
                close: async () => {
                  browserClosed = true;
                },
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
        ),
      /Timed out waiting for authenticated 99Freelas session.*kmlicn/,
    );
    assert.equal(browserClosed, true);
  } finally {
    timers.setTimeout = originalSleep;
    Date.now = originalDateNow;
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

test("interactive login launch mode polls until authenticated", async () => {
  const { startInteractiveLoginWith } = require("../dist/auth/interactiveLogin.js");
  const timers = require("node:timers/promises");
  const originalSleep = timers.setTimeout;
  const originalDocument = global.document;
  const originalWindow = global.window;
  const visited = [];
  let snapshots = 0;

  timers.setTimeout = async () => {};

  try {
    const result = await startInteractiveLoginWith(
      {
        browserMode: "launch",
        timeoutMs: 25,
      },
      {
        chromium: {
          launch: async () => ({
            newContext: async () => ({
              newPage: async () => ({
                goto: async (url) => {
                  visited.push(url);
                },
                evaluate: async (fn) => {
                  snapshots += 1;
                  global.window = {
                    location: {
                      href:
                        snapshots >= 2
                          ? "https://www.99freelas.com.br/dashboard"
                          : "https://www.99freelas.com.br/login",
                    },
                  };
                  global.document = {
                    querySelector: (selector) =>
                      snapshots >= 2 && selector === "[data-username]"
                        ? { textContent: "launch_polled_user" }
                        : null,
                  };
                  return fn();
                },
              }),
              storageState: async () => ({
                cookies: [
                  {
                    name: "sgcn",
                    value: "ok",
                    domain: ".99freelas.com.br",
                    path: "/",
                    secure: true,
                    expires: -1,
                    httpOnly: false,
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

    assert.deepEqual(visited, [
      "https://www.99freelas.com.br/dashboard",
      "https://www.99freelas.com.br/login",
    ]);
    assert.equal(result.username, "launch_polled_user");
    assert.equal(result.cookies[0].name, "sgcn");
  } finally {
    timers.setTimeout = originalSleep;
    global.document = originalDocument;
    global.window = originalWindow;
  }
});
