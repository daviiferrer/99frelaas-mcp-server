import { chromium } from "playwright";
import { setTimeout as sleep } from "timers/promises";
import { Cookie } from "../clients/httpClient";
import {
  attachToCdpEndpoint,
  autoConnectToBrowser,
  defaultCdpEndpoints,
  waitForCdpEndpoint,
} from "./cdpBrowser";
import { launchChromeWithRemoteDebug } from "./chromeLauncher";

const BASE_URL = process.env.NINETY_NINE_BASE_URL ?? "https://www.99freelas.com.br";
const LOGIN_URL = `${BASE_URL}/login`;
const DASHBOARD_URL = `${BASE_URL}/dashboard`;

type InteractiveLoginInput = {
  headless?: boolean;
  timeoutMs?: number;
  browserMode?: "chrome" | "attach" | "launch";
  cdpEndpointURL?: string;
  cdpPorts?: number[];
  chromeExecutablePath?: string;
  chromeUserDataDir?: string;
  chromePort?: number;
};

type InteractiveLoginOutput = {
  cookies: Cookie[];
  userId?: string;
  username?: string;
  browserMode: "chrome" | "attach" | "launch";
  cdpEndpointURL?: string;
  chromeUserDataDir?: string;
  chromePort?: number;
};

type InteractiveLoginDeps = {
  chromium: { launch: (options: { headless: boolean }) => Promise<any> };
  autoConnectToBrowser: typeof autoConnectToBrowser;
  defaultCdpEndpoints: typeof defaultCdpEndpoints;
  launchChromeWithRemoteDebug: typeof launchChromeWithRemoteDebug;
  waitForCdpEndpoint: typeof waitForCdpEndpoint;
  attachToCdpEndpoint: typeof attachToCdpEndpoint;
};

const isAuthenticatedUrl = (url: string): boolean =>
  /\/(dashboard|painel|projetos)(\/|$|[?#])/i.test(url) && !/\/login(?:\/|$|[?#])/i.test(url);

const isLoginUrl = (url: string): boolean => /\/login(?:\/|$|[?#])/i.test(url);

const CORE_AUTH_COOKIE_NAMES = ["JSESSIONID", "kmlicn", "kmlicin", "sgcn"];

const readCookies = async (
  context: Awaited<ReturnType<typeof attachToCdpEndpoint>>["context"],
): Promise<Cookie[]> => {
  const maybeCookiesContext = context as Awaited<ReturnType<typeof attachToCdpEndpoint>>["context"] & {
    cookies?: (urls?: string[]) => Promise<any[]>;
  };
  const cookies = maybeCookiesContext.cookies
    ? await maybeCookiesContext.cookies([BASE_URL])
    : (await context.storageState()).cookies;
  /* c8 ignore start */
  const normalizedCookies = cookies.map((cookie: any) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
  }));
  /* c8 ignore end */
  return normalizedCookies;
};

const readPageSnapshot = async (
  page: Awaited<ReturnType<typeof attachToCdpEndpoint>>["page"],
): Promise<{ url?: string; username?: string }> =>
  page.evaluate(() => {
    const candidate =
      document.querySelector("[data-username]") ||
      document.querySelector(".user-name") ||
      document.querySelector("meta[name='author']");

    return {
      url: typeof window !== "undefined" ? window.location.href : undefined,
      username: candidate?.textContent?.trim() || undefined,
    };
  });

const runWithDeadline = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const collectPageSnapshots = async (
  context: Awaited<ReturnType<typeof attachToCdpEndpoint>>["context"],
  preferredPage: Awaited<ReturnType<typeof attachToCdpEndpoint>>["page"],
): Promise<Array<{ url?: string; username?: string }>> => {
  const contextPages = "pages" in context && typeof context.pages === "function" ? context.pages() : [];
  const pages = [preferredPage, ...contextPages].filter(
    (page, index, allPages) => allPages.indexOf(page) === index,
  );
  const snapshots: Array<{ url?: string; username?: string }> = [];

  for (const page of pages) {
    try {
      snapshots.push(await readPageSnapshot(page));
    } catch {
      snapshots.push({});
    }
  }

  return snapshots;
};

const checkAuthenticatedState = async (
  context: Awaited<ReturnType<typeof attachToCdpEndpoint>>["context"],
  preferredPage: Awaited<ReturnType<typeof attachToCdpEndpoint>>["page"],
): Promise<{
  ok: boolean;
  onLogin: boolean;
  cookies: Cookie[];
  pageSnapshots: Array<{ url?: string; username?: string }>;
  username?: string;
  hasCoreCookie: boolean;
  hasAuthenticatedPage: boolean;
}> => {
  const cookies = await readCookies(context);
  const pageSnapshots = await collectPageSnapshots(context, preferredPage);
  const authenticatedPage = pageSnapshots.find((snapshot) => snapshot.url && isAuthenticatedUrl(snapshot.url));
  const onLogin = pageSnapshots.some((snapshot) => snapshot.url && isLoginUrl(snapshot.url));
  const domSignal = Boolean(authenticatedPage);
  const hasCoreCookie = cookies.some((cookie) => CORE_AUTH_COOKIE_NAMES.includes(cookie.name));
  const username = authenticatedPage?.username ?? pageSnapshots.find((snapshot) => snapshot.username)?.username;

  return {
    ok: domSignal && !onLogin,
    onLogin,
    cookies,
    pageSnapshots,
    username,
    hasCoreCookie,
    hasAuthenticatedPage: domSignal,
  };
};

const buildLoginOutput = async (
  attached: Awaited<ReturnType<typeof attachToCdpEndpoint>>,
  browserMode: InteractiveLoginOutput["browserMode"],
  cdpEndpointURL?: string,
  chromeUserDataDir?: string,
  chromePort?: number,
): Promise<InteractiveLoginOutput> => {
  const state = await checkAuthenticatedState(attached.context, attached.page);

  return {
    cookies: state.cookies,
    username: state.username,
    browserMode,
    cdpEndpointURL,
    chromeUserDataDir,
    chromePort,
  };
};

const captureSessionFromAttachedBrowser = async (
  attached: Awaited<ReturnType<typeof attachToCdpEndpoint>>,
  timeoutMs: number,
  browserMode: InteractiveLoginOutput["browserMode"],
  cdpEndpointURL?: string,
  chromeUserDataDir?: string,
  chromePort?: number,
): Promise<InteractiveLoginOutput> => {
  try {
    const gotoTimeout = Math.max(5_000, Math.min(timeoutMs, 15_000));

    await attached.page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: gotoTimeout });
    const existingState = await checkAuthenticatedState(attached.context, attached.page);
    if (existingState.ok) {
      return buildLoginOutput(
        attached,
        browserMode,
        cdpEndpointURL,
        chromeUserDataDir,
        chromePort,
      );
    }

    await attached.page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: gotoTimeout });

    const startedAt = Date.now();
    let lastObservedUrl = existingState.pageSnapshots.find((snapshot) => snapshot.url)?.url;
    let lastSignal = `coreCookie=${existingState.hasCoreCookie}, authenticatedPage=${existingState.hasAuthenticatedPage}, onLogin=${existingState.onLogin}`;

    while (Date.now() - startedAt < timeoutMs) {
      const state = await checkAuthenticatedState(attached.context, attached.page);
      lastObservedUrl = state.pageSnapshots.find((snapshot) => snapshot.url)?.url ?? lastObservedUrl;
      lastSignal = `coreCookie=${state.hasCoreCookie}, authenticatedPage=${state.hasAuthenticatedPage}, onLogin=${state.onLogin}`;
      if (state.ok) {
        return buildLoginOutput(
          attached,
          browserMode,
          cdpEndpointURL,
          chromeUserDataDir,
          chromePort,
        );
      }
      await sleep(1000);
    }

    throw new Error(
      `Timed out waiting for authenticated 99Freelas session. Last URL: ${lastObservedUrl ?? "unknown"}. Signals: ${lastSignal}. Cookies seen: ${existingState.cookies.map((c) => c.name).join(", ") || "none"}`,
    );
  } finally {
    await attached.browser.close();
  }
};

export const startInteractiveLoginWith = async (
  input: InteractiveLoginInput,
  deps: InteractiveLoginDeps,
): Promise<InteractiveLoginOutput> => {
  const timeoutMs = input.timeoutMs ?? 180_000;
  const browserMode = input.browserMode ?? "chrome";

  return runWithDeadline(
    (async () => {
      if (browserMode === "chrome") {
        const launched = await deps.launchChromeWithRemoteDebug({
          executablePath: input.chromeExecutablePath,
          userDataDir: input.chromeUserDataDir,
          port: input.chromePort,
        });
        await deps.waitForCdpEndpoint(launched.endpointURL, timeoutMs);
        const attached = await deps.attachToCdpEndpoint(launched.endpointURL);
        return captureSessionFromAttachedBrowser(
          attached,
          timeoutMs,
          "chrome",
          launched.endpointURL,
          launched.userDataDir,
          launched.port,
        );
      }

      if (browserMode === "attach") {
        const attached = input.cdpEndpointURL
          ? await deps.autoConnectToBrowser([input.cdpEndpointURL])
          : await deps.autoConnectToBrowser(deps.defaultCdpEndpoints(input.cdpPorts));

        /* c8 ignore next 2 */
        return captureSessionFromAttachedBrowser(
          attached,
          timeoutMs,
          "attach",
          attached.endpointURL,
        );
      }

      const browser = await deps.chromium.launch({ headless: input.headless ?? false });
      const context = await browser.newContext();
      const page = await context.newPage();
      const gotoTimeout = Math.max(5_000, Math.min(timeoutMs, 15_000));

      try {
        await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: gotoTimeout });
        const existingState = await checkAuthenticatedState(context, page);
        if (existingState.ok) {
          return {
            cookies: existingState.cookies,
            username: existingState.username,
            browserMode: "launch",
          };
        }

        await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: gotoTimeout });

        const startedAt = Date.now();
        let lastObservedUrl = existingState.pageSnapshots.find((snapshot) => snapshot.url)?.url;
        let lastSignal = `coreCookie=${existingState.hasCoreCookie}, authenticatedPage=${existingState.hasAuthenticatedPage}, onLogin=${existingState.onLogin}`;

        while (Date.now() - startedAt < timeoutMs) {
          const state = await checkAuthenticatedState(context, page);
          lastObservedUrl = state.pageSnapshots.find((snapshot) => snapshot.url)?.url ?? lastObservedUrl;
          lastSignal = `coreCookie=${state.hasCoreCookie}, authenticatedPage=${state.hasAuthenticatedPage}, onLogin=${state.onLogin}`;
          if (state.ok) {
            return {
              cookies: state.cookies,
              username: state.username,
              browserMode: "launch",
            };
          }
          await sleep(1000);
        }

        throw new Error(
          `Timed out waiting for authenticated 99Freelas session. Last URL: ${lastObservedUrl ?? "unknown"}. Signals: ${lastSignal}. Cookies seen: ${existingState.cookies.map((c) => c.name).join(", ") || "none"}`,
        );
      } finally {
        await browser.close();
      }
    })(),
    timeoutMs + 5_000,
    `Interactive login exceeded ${timeoutMs}ms and was aborted`,
  );
};

export const startInteractiveLogin = async (
  input: InteractiveLoginInput,
): Promise<InteractiveLoginOutput> =>
  startInteractiveLoginWith(input, {
    chromium,
    autoConnectToBrowser,
    defaultCdpEndpoints,
    launchChromeWithRemoteDebug,
    waitForCdpEndpoint,
    attachToCdpEndpoint,
  });
