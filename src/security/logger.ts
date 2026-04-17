import { appendFile } from "fs/promises";
import { randomUUID } from "crypto";

const resolveLogLevel = (): "debug" | "info" | "warn" | "error" =>
  (process.env.LOG_LEVEL ?? "info").toLowerCase() as "debug" | "info" | "warn" | "error";

const resolveLogFile = (): string | undefined => process.env.LOG_FILE?.trim() || undefined;
const shouldWriteStderr = (): boolean => (process.env.LOG_STDERR ?? "false").toLowerCase() === "true";
let fileWriteChain = Promise.resolve();

const shouldLog = (level: "debug" | "info" | "warn" | "error"): boolean => {
  const current = resolveLogLevel();
  const order = { debug: 0, info: 1, warn: 2, error: 3 };
  return order[level] >= order[current];
};

const serialize = (level: string, message: string, meta?: unknown): string => {
  const payload = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  return `[99freelas-mcp] ${level.toUpperCase()} ${message}${payload}\n`;
};

const writeFileLog = async (line: string): Promise<void> => {
  const filePath = resolveLogFile();
  if (!filePath) return;
  await appendFile(filePath, line, "utf8");
};

const emit = (line: string): void => {
  if (shouldWriteStderr()) {
    process.stderr.write(line);
  }
  fileWriteChain = fileWriteChain.then(() => writeFileLog(line)).catch(() => undefined);
};

export const createRequestId = (): string => randomUUID();

export const getErrorMeta = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown }).code;
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      ...(typeof maybeCode === "string" ? { errorCode: maybeCode } : {}),
    };
  }
  return { errorMessage: String(error) };
};

export const elapsedMs = (startedAt: number): number => Date.now() - startedAt;

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (!shouldLog("debug")) return;
    const line = serialize("debug", message, meta);
    emit(line);
  },
  info(message: string, meta?: unknown): void {
    if (!shouldLog("info")) return;
    const line = serialize("info", message, meta);
    emit(line);
  },
  warn(message: string, meta?: unknown): void {
    if (!shouldLog("warn")) return;
    const line = serialize("warn", message, meta);
    emit(line);
  },
  error(message: string, meta?: unknown): void {
    if (!shouldLog("error")) return;
    const line = serialize("error", message, meta);
    emit(line);
  },
};
