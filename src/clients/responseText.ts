const decodeCharset = (buffer: ArrayBuffer, charset: string): string => {
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
};

const extractCharset = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  return match?.[1]?.trim();
};

export const readResponseText = async (response: Response): Promise<string> => {
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) return "";
  const charset = extractCharset(response.headers.get("content-type"));
  if (!charset) {
    return decodeCharset(buffer, "utf-8");
  }

  const normalized = charset.toLowerCase();
  if (normalized === "iso-8859-1" || normalized === "latin1" || normalized === "latin-1") {
    return decodeCharset(buffer, "windows-1252");
  }

  return decodeCharset(buffer, normalized);
};
