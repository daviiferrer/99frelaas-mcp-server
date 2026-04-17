export const nowIso = (): string => new Date().toISOString();

export const startOfDayIso = (): string => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
};

const DEFAULT_OPERATION_TIMEZONE = "America/Sao_Paulo";

export const resolveOperationTimeZone = (): string => {
  const raw = process.env.OPERATION_TIMEZONE?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_OPERATION_TIMEZONE;
};

export const localDateKey = (value = new Date(), timeZone = resolveOperationTimeZone()): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
    return value.toISOString().slice(0, 10);
  } catch {
    return value.toISOString().slice(0, 10);
  }
};
