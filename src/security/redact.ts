const SENSITIVE_KEYS = [
  "cookie",
  "cookies",
  "authorization",
  "session",
  "token",
  "password",
];

export const redactValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactValue);

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, innerValue] of Object.entries(input)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = redactValue(innerValue);
  }
  return output;
};
