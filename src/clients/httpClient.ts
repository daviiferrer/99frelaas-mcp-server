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

    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      redirect: "follow",
    });
    this.absorbSetCookie(response);
    return response;
  }
}
