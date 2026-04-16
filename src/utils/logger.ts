import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { redactValue } from "../security/redact";
import { nowIso } from "./time";

const filePath = process.env.AUDIT_LOG_FILE ?? ".data/audit.log";

export const logAudit = async (event: string, payload?: unknown): Promise<void> => {
  const line = JSON.stringify({
    ts: nowIso(),
    event,
    payload: redactValue(payload),
  });

  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${line}\n`, "utf8");
};
