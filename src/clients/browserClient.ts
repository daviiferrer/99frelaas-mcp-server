import { chromium } from "playwright";

type BrowserClientDeps = { chromium: { launch: (options: { headless: boolean }) => Promise<any> } };

export const openBrowserForDebugWith = async (
  url: string,
  deps: BrowserClientDeps,
): Promise<void> => {
  const browser = await deps.chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
};

export const openBrowserForDebug = async (url: string): Promise<void> =>
  openBrowserForDebugWith(url, { chromium });
