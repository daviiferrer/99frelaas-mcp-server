export type StoredCookie = {
  name: string;
  valueEncrypted: string;
  domain: string;
  path: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
};

export type SessionRecord = {
  sessionId: string;
  userId?: string;
  username?: string;
  lastValidatedAt?: string;
  updatedAt: string;
  cookies: StoredCookie[];
};
