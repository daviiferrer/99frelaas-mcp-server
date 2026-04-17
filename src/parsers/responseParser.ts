import { readResponseText } from "../clients/responseText";
import { logger } from "../security/logger";

export const safeJson = async <T>(response: Response): Promise<T | undefined> => {
  const text = await readResponseText(response);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      logger.warn("response.safe_json.decode_uri_retry", { url: response.url, status: response.status });
      return JSON.parse(decodeURIComponent(text)) as T;
    } catch {
      logger.warn("response.safe_json.fail", { url: response.url, status: response.status, sample: text.slice(0, 180) });
      return undefined;
    }
  }
};
