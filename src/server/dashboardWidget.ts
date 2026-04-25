import { readFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import type { ReadResourceResult, Resource } from "@modelcontextprotocol/sdk/types.js";

const DASHBOARD_WIDGET_MIME_TYPE = "text/html;profile=mcp-app";
const DIST_DIRECTORY = join(process.cwd(), "web", "dist");

const readDashboardBundle = (): string => {
  return readFileSync(join(DIST_DIRECTORY, "dashboard.js"), "utf8");
};

const buildWidgetRevision = (bundle: string): string =>
  createHash("sha256").update(bundle).digest("hex").slice(0, 12);

export const getDashboardWidgetUri = (): string => {
  const bundle = readDashboardBundle();
  return `ui://99freelas/dashboard-${buildWidgetRevision(bundle)}`;
};

const escapeHtmlJson = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

const createBridgeScript = (): string => `
const EVENT_NAME = "99freelas-dashboard-payload";
let rpcId = 0;
const pendingRequests = new Map();

const rpcNotify = (method, params) => {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
};

const rpcRequest = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++rpcId;
    pendingRequests.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });

const setPayload = (payload) => {
  window.__99freelasDashboardPayload__ = payload ?? null;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

window.addEventListener(
  "message",
  (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;

    if (typeof message.id === "number") {
      const pending = pendingRequests.get(message.id);
      if (!pending) return;
      pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(message.error);
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (message.method === "ui/notifications/tool-result") {
      setPayload(message.params?.structuredContent ?? null);
    }
  },
  { passive: true },
);

const initializeBridge = async () => {
  try {
    await rpcRequest("ui/initialize", {
      appInfo: { name: "99freelas-dashboard-widget", version: "0.1.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    });
    rpcNotify("ui/notifications/initialized", {});
  } catch (error) {
    console.error("Failed to initialize dashboard widget bridge", error);
  }
};

void initializeBridge();
`.trim();

const createHtmlDocument = (bootstrapPayload: unknown): string => {
  const bundle = readDashboardBundle();
  const payloadJson = escapeHtmlJson(bootstrapPayload);
  const bridgeScript = createBridgeScript();

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>99Freelas Dashboard</title>
  </head>
  <body style="margin:0">
    <div id="root"></div>
    <script>
      window.__99freelasDashboardPayload__ = ${payloadJson};
    </script>
    <script>
      ${bridgeScript}
    </script>
    <script type="module">
      ${bundle}
    </script>
  </body>
</html>`;
};

export const dashboardWidgetResource: Resource = {
  uri: getDashboardWidgetUri(),
  name: "dashboard-widget",
  description: "React dashboard widget for the authenticated 99Freelas account summary.",
  mimeType: DASHBOARD_WIDGET_MIME_TYPE,
};

export const getDashboardWidgetMeta = (): Record<string, unknown> => ({
  ui: {
    resourceUri: getDashboardWidgetUri(),
    prefersBorder: true,
  },
  "openai/outputTemplate": getDashboardWidgetUri(),
});

export const readDashboardWidgetResource = (): ReadResourceResult => ({
  contents: [
    {
      uri: getDashboardWidgetUri(),
      mimeType: DASHBOARD_WIDGET_MIME_TYPE,
      text: createHtmlDocument(null),
      _meta: {
        ui: {
          prefersBorder: true,
          domain: "https://99freelas-mcp.axischat.com.br",
          csp: {
            connectDomains: ["https://99freelas-mcp.axischat.com.br"],
            resourceDomains: [
              "https://99freelas-mcp.axischat.com.br",
              "https://www.99freelas.com.br",
              "https://d1fuainj13qzhu.cloudfront.net",
              "https://duqxk0v9olda1.cloudfront.net",
              "https://99freelas-x.s3.us-east-2.amazonaws.com",
            ],
          },
        },
        "openai/widgetPrefersBorder": true,
        "openai/widgetDomain": "https://99freelas-mcp.axischat.com.br",
        "openai/widgetCSP": {
          connect_domains: ["https://99freelas-mcp.axischat.com.br"],
          resource_domains: [
            "https://99freelas-mcp.axischat.com.br",
            "https://www.99freelas.com.br",
            "https://d1fuainj13qzhu.cloudfront.net",
            "https://duqxk0v9olda1.cloudfront.net",
            "https://99freelas-x.s3.us-east-2.amazonaws.com",
          ],
        },
      },
    },
  ],
});

export const renderDashboardPreviewHtml = (payload: unknown): string => createHtmlDocument(payload);
