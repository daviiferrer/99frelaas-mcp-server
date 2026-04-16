import { readFile } from "fs/promises";
import { Cookie } from "../clients/httpClient";

type RawManualCookie = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  secure?: boolean;
  httpOnly?: boolean;
};

const DEFAULT_BASE_URL = process.env.NINETY_NINE_BASE_URL ?? "https://www.99freelas.com.br";
const DEFAULT_MANUAL_COOKIES_FILE = process.env.MANUAL_COOKIES_FILE ?? ".data/manual-cookies.json";

const normalizeCookie = (item: RawManualCookie): Cookie | null => {
  if (!item.name || !item.value || !item.domain) return null;
  return {
    name: item.name,
    value: item.value,
    domain: item.domain,
    path: item.path ?? "/",
    expires: item.expirationDate,
    secure: item.secure,
    httpOnly: item.httpOnly,
  };
};

export const parseManualCookies = (input: unknown): Cookie[] => {
  if (!Array.isArray(input)) {
    if (
      typeof input === "object" &&
      input !== null &&
      Array.isArray((input as { cookies?: unknown }).cookies)
    ) {
      return parseManualCookies((input as { cookies: unknown }).cookies);
    }
    throw new Error("Manual cookies payload must be a JSON array or an object with a cookies array");
  }
  const cookies = input
    .map((entry) => normalizeCookie(entry as RawManualCookie))
    .filter((entry): entry is Cookie => Boolean(entry));

  if (cookies.length === 0) {
    throw new Error("No valid cookies found in payload");
  }

  return cookies;
};

export const loadManualCookiesFromFile = async (filePath = DEFAULT_MANUAL_COOKIES_FILE): Promise<Cookie[]> => {
  const raw = await readFile(filePath, "utf8");
  return parseManualCookies(JSON.parse(raw));
};

export const getDefaultManualCookiesFile = (): string => DEFAULT_MANUAL_COOKIES_FILE;
export const getDefaultBaseUrl = (): string => DEFAULT_BASE_URL;
