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

  private absorbSetCookie(response: Response): void {
    const raw = response.headers.get("set-cookie");
    if (!raw) return;
    const first = raw.split(";")[0];
    const [name, value] = first.split("=");
    if (!name || value === undefined) return;
    const domain = new URL(this.baseUrl).hostname;
    const found = this.cookies.find((c) => c.name === name);
    if (found) found.value = value;
    else this.cookies.push({ name, value, domain, path: "/" });
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
