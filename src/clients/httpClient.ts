import { elapsedMs, getErrorMeta, logger } from "../security/logger";

export type Cookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
};

type RequestInitLike = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

const splitSetCookieHeader = (raw: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  let inExpiresAttribute = false;

  for (let i = 0; i < raw.length; i += 1) {
    const rest = raw.slice(i);
    if (rest.length >= 8 && rest.slice(0, 8).toLowerCase() === "expires=") {
      inExpiresAttribute = true;
      i += 7;
      continue;
    }
    if (inExpiresAttribute && raw[i] === ";") {
      inExpiresAttribute = false;
      continue;
    }
    if (!inExpiresAttribute && raw[i] === ",") {
      const cookie = raw.slice(start, i).trim();
      if (cookie) {
        parts.push(cookie);
      }
      start = i + 1;
    }
  }

  const tail = raw.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
};

const parseSetCookieLine = (line: string, defaultDomain: string): Cookie | undefined => {
  const [pair, ...attrs] = line.split(";").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }
  const name = pair.slice(0, separatorIndex).trim();
  const value = pair.slice(separatorIndex + 1).trim();
  if (!name) {
    return undefined;
  }

  const cookie: Cookie = { name, value, domain: defaultDomain, path: "/" };
  for (const attr of attrs) {
    const [rawKey, ...rawValueParts] = attr.split("=");
    const key = rawKey.trim().toLowerCase();
    const attrValue = rawValueParts.join("=").trim();
    if (key === "domain" && attrValue) {
      cookie.domain = attrValue;
    } else if (key === "path" && attrValue) {
      cookie.path = attrValue;
    } else if (key === "secure") {
      cookie.secure = true;
    } else if (key === "httponly") {
      cookie.httpOnly = true;
    } else if (key === "expires" && attrValue) {
      const expiresAt = Date.parse(attrValue);
      if (!Number.isNaN(expiresAt)) {
        cookie.expires = Math.floor(expiresAt / 1000);
      }
    } else if (key === "max-age" && attrValue) {
      const maxAge = Number(attrValue);
      if (Number.isFinite(maxAge)) {
        cookie.expires = Math.floor(Date.now() / 1000) + Math.max(0, Math.floor(maxAge));
      }
    }
  }
  return cookie;
};

export class HttpClient {
  private readonly baseUrl: string;
  private cookies: Cookie[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  setCookies(cookies: Cookie[]): void {
    this.cookies = cookies;
  }

  getCookies(): Cookie[] {
    return [...this.cookies];
  }

  createChildWithCookies(cookies: Cookie[]): HttpClient {
    const child = new HttpClient(this.baseUrl);
    child.setCookies(cookies);
    return child;
  }

  private buildCookieHeader(): string {
    return this.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  private readSetCookieHeaders(response: Response): string[] {
    const headersWithSetCookie = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    if (typeof headersWithSetCookie.getSetCookie === "function") {
      const values = headersWithSetCookie.getSetCookie();
      if (values.length > 0) {
        return values;
      }
    }
    const raw = response.headers.get("set-cookie");
    if (!raw) {
      return [];
    }
    return splitSetCookieHeader(raw);
  }

  private absorbSetCookie(response: Response): void {
    const domain = new URL(this.baseUrl).hostname;
    const setCookieLines = this.readSetCookieHeaders(response);
    for (const line of setCookieLines) {
      const parsed = parseSetCookieLine(line, domain);
      if (!parsed) {
        continue;
      }
      const found = this.cookies.find((cookie) => cookie.name === parsed.name && cookie.domain === parsed.domain);
      if (found) {
        found.value = parsed.value;
        found.path = parsed.path;
        found.expires = parsed.expires;
        found.secure = parsed.secure;
        found.httpOnly = parsed.httpOnly;
      } else {
        this.cookies.push(parsed);
      }
    }
  }

  async request(path: string, init: RequestInitLike = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const startedAt = Date.now();
    const method = init.method ?? "GET";
    const headers: Record<string, string> = {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
      referer: "https://www.99freelas.com.br/projects",
      origin: "https://www.99freelas.com.br",
      ...(init.headers ?? {}),
    };
    if (this.cookies.length > 0) {
      headers.cookie = this.buildCookieHeader();
    }
    logger.debug("http.request.start", {
      method,
      url,
      hasBody: Boolean(init.body),
      cookieCount: this.cookies.length,
      headerKeys: Object.keys(headers).filter((key) => key !== "cookie"),
    });

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: init.body,
        redirect: "follow",
      });
      this.absorbSetCookie(response);
      logger.info("http.request.ok", {
        method,
        url,
        status: response.status,
        redirected: response.redirected,
        finalUrl: response.url,
        durationMs: elapsedMs(startedAt),
      });
      return response;
    } catch (error) {
      logger.error("http.request.fail", {
        method,
        url,
        durationMs: elapsedMs(startedAt),
        ...getErrorMeta(error),
      });
      throw error;
    }
  }
}
