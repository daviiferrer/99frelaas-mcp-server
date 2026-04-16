import { Cookie } from "../clients/httpClient";
import { SessionRecord, StoredCookie } from "./authTypes";
import { decryptText, encryptText } from "../security/encrypt";

export class CookieStore {
  toStored(cookies: Cookie[]): StoredCookie[] {
    return cookies.map((cookie) => ({
      name: cookie.name,
      valueEncrypted: encryptText(cookie.value),
      domain: cookie.domain,
      path: cookie.path ?? "/",
      expires: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
    }));
  }

  fromStored(record: SessionRecord): Cookie[] {
    return record.cookies.map((cookie) => ({
      name: cookie.name,
      value: decryptText(cookie.valueEncrypted),
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
    }));
  }
}
