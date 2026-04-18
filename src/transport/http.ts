import { createServer as createNodeHttpServer, IncomingMessage, Server as NodeHttpServer, ServerResponse } from "http";
import { randomUUID, timingSafeEqual } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { logger } from "../security/logger";

export type HttpServerOptions = {
  host: string;
  port: number;
  apiKey: string;
  mcpPath?: string;
};

export type RunningHttpServer = {
  close: () => Promise<void>;
  server: NodeHttpServer;
  url: string;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
  };
  id: null;
};

const jsonRpcError = (code: number, message: string): JsonRpcError => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown, headers?: Record<string, string>): void => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString(),
    ...headers,
  });
  res.end(body);
};

const sendText = (res: ServerResponse, statusCode: number, text: string, headers?: Record<string, string>): void => {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(text).toString(),
    ...headers,
  });
  res.end(text);
};

const getHeaderValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const extractApiKey = (req: IncomingMessage): string | undefined => {
  const authorization = getHeaderValue(req.headers.authorization);
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return getHeaderValue(req.headers["x-api-key"])?.trim();
};

const constantTimeEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const isAuthorized = (req: IncomingMessage, apiKey: string): boolean => {
  const provided = extractApiKey(req);
  return Boolean(provided && constantTimeEquals(provided, apiKey));
};

const readJsonBody = async (req: IncomingMessage): Promise<unknown> =>
  await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("error", reject);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });

const getRequestPath = (req: IncomingMessage): string => {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.pathname;
};

export const startHttpServer = async (
  createMcpServer: () => Server,
  options: HttpServerOptions,
): Promise<RunningHttpServer> => {
  const mcpPath = options.mcpPath ?? "/mcp";
  const transports = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

  const closeSession = async (sessionId: string): Promise<void> => {
    const active = transports.get(sessionId);
    if (!active) return;
    transports.delete(sessionId);
    await active.transport.close().catch((error) => logger.warn("http.transport.close.fail", { sessionId, error: String(error) }));
    await active.server.close().catch((error) => logger.warn("http.server.close.fail", { sessionId, error: String(error) }));
  };

  const httpServer = createNodeHttpServer(async (req, res) => {
    try {
      const path = getRequestPath(req);

      if (req.method === "GET" && path === "/healthz") {
        sendJson(res, 200, { ok: true, transport: "http" });
        return;
      }

      if (path !== mcpPath) {
        sendJson(res, 404, { ok: false, error: "Not found" });
        return;
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          allow: "GET, POST, DELETE, OPTIONS",
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-headers": "authorization, x-api-key, content-type, mcp-session-id, mcp-protocol-version, last-event-id",
          "access-control-expose-headers": "mcp-session-id",
        });
        res.end();
        return;
      }

      if (!isAuthorized(req, options.apiKey)) {
        res.writeHead(401, {
          "www-authenticate": 'Bearer realm="99freelas-mcp"',
          "content-type": "text/plain; charset=utf-8",
        });
        res.end("Unauthorized");
        return;
      }

      if (req.method === "POST") {
        const parsedBody = await readJsonBody(req);
        const sessionId = getHeaderValue(req.headers["mcp-session-id"]);
        let active = sessionId ? transports.get(sessionId) : undefined;

        if (!active) {
          if (sessionId || !isInitializeRequest(parsedBody)) {
            sendJson(res, 400, jsonRpcError(-32000, "Bad Request: No valid session ID provided"));
            return;
          }

          let initializedSessionId: string | undefined;
          let mcpServer: Server;
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              initializedSessionId = newSessionId;
              transports.set(newSessionId, { server: mcpServer, transport });
            },
          });
          mcpServer = createMcpServer();
          transport.onclose = () => {
            const id = initializedSessionId ?? transport.sessionId;
            if (id) void closeSession(id);
          };
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        await active.transport.handleRequest(req, res, parsedBody);
        return;
      }

      if (req.method === "GET" || req.method === "DELETE") {
        const sessionId = getHeaderValue(req.headers["mcp-session-id"]);
        const active = sessionId ? transports.get(sessionId) : undefined;
        if (!sessionId || !active) {
          sendText(res, 400, "Invalid or missing session ID");
          return;
        }
        await active.transport.handleRequest(req, res);
        if (req.method === "DELETE") {
          await closeSession(sessionId);
        }
        return;
      }

      sendJson(res, 405, jsonRpcError(-32000, "Method not allowed"), { allow: "GET, POST, DELETE, OPTIONS" });
    } catch (error) {
      logger.error("http.request.error", { error: String(error) });
      if (!res.headersSent) {
        sendJson(res, 500, jsonRpcError(-32603, "Internal server error"));
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : options.port;
  const urlHost = options.host === "0.0.0.0" ? "127.0.0.1" : options.host;
  const url = `http://${urlHost}:${actualPort}${mcpPath}`;
  logger.info("server.start", { transport: "http", host: options.host, port: actualPort, mcpPath });

  return {
    server: httpServer,
    url,
    close: async () => {
      await Promise.all(Array.from(transports.keys()).map(closeSession));
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};
