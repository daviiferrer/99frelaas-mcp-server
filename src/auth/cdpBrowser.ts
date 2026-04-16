import { chromium } from "playwright";
import { setTimeout as sleep } from "timers/promises";

export type ConnectedBrowserPage = {
  browser: {
    close: () => Promise<void>;
  };
  context: {
    pages: () => Array<{
      goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout?: number }) => Promise<unknown>;
      waitForURL: (
        matcher: (url: URL) => boolean,
        options: { timeout: number },
      ) => Promise<unknown>;
      evaluate: <T>(fn: () => T) => Promise<T>;
    }>;
    newPage: () => Promise<{
      goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout?: number }) => Promise<unknown>;
      waitForURL: (
        matcher: (url: URL) => boolean,
        options: { timeout: number },
      ) => Promise<unknown>;
      evaluate: <T>(fn: () => T) => Promise<T>;
    }>;
    cookies: (urls?: string[]) => Promise<Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      secure: boolean;
      expires: number;
      httpOnly: boolean;
    }>>;
    storageState: () => Promise<{
      cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        secure: boolean;
        expires: number;
        httpOnly: boolean;
      }>;
    }>;
  };
  page: {
    goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout?: number }) => Promise<unknown>;
    waitForURL: (
      matcher: (url: URL) => boolean,
      options: { timeout: number },
    ) => Promise<unknown>;
    evaluate: <T>(fn: () => T) => Promise<T>;
  };
};

const DEFAULT_CDP_PORTS = [9222, 9223, 9229];

export const defaultCdpEndpoints = (ports = DEFAULT_CDP_PORTS): string[] =>
  ports.map((port) => `http://127.0.0.1:${port}`);

export const waitForCdpEndpoint = async (
  endpointURL: string,
  timeoutMs = 30_000,
): Promise<string> => {
  const startedAt = Date.now();
  let lastError: string | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${endpointURL.replace(/\/+$/, "")}/json/version`);
      if (response.ok) {
        const data = (await response.json()) as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) {
          return endpointURL;
        }
      }
      lastError = `Unexpected status ${response.status}`;
    } catch (error) {
      lastError = (error as Error).message;
    }
    await sleep(250);
  }

  /* c8 ignore next */
  throw new Error(`Timed out waiting for CDP endpoint ${endpointURL}: ${lastError ?? "unknown error"}`);
};

export const connectToExistingBrowser = async (
  endpointURL: string,
): Promise<ConnectedBrowserPage> => {
  const browser = await chromium.connectOverCDP(endpointURL);
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error(`No browser context available on CDP endpoint ${endpointURL}`);
  }

  const page = context.pages()[0] ?? (await context.newPage());
  return {
    browser: {
      // Do not close the user's browser when we're attached via CDP.
      close: async () => {},
    },
    context,
    page,
  };
};

export const autoConnectToBrowser = async (
  endpoints = defaultCdpEndpoints(),
): Promise<ConnectedBrowserPage & { endpointURL: string }> => {
  const errors: string[] = [];

  for (const endpointURL of endpoints) {
    try {
      const connected = await connectToExistingBrowser(endpointURL);
      return { ...connected, endpointURL };
    } catch (error) {
      errors.push(`${endpointURL}: ${(error as Error).message}`);
    }
  }

  throw new Error(
    `Could not attach to an existing Chromium browser over CDP. Tried: ${errors.join(" | ")}`,
  );
};

export const attachToCdpEndpoint = async (
  endpointURL: string,
): Promise<ConnectedBrowserPage & { endpointURL: string }> => {
  const connected = await connectToExistingBrowser(endpointURL);
  return { ...connected, endpointURL };
};
