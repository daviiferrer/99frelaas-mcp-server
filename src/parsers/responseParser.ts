import { readResponseText } from "../clients/responseText";

export const safeJson = async <T>(response: Response): Promise<T | undefined> => {
  const text = await readResponseText(response);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(text)) as T;
    } catch {
      return undefined;
    }
  }
};
