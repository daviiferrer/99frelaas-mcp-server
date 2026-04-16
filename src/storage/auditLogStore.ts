import { logAudit } from "../utils/logger";

export class AuditLogStore {
  async append(event: string, payload?: unknown): Promise<void> {
    await logAudit(event, payload);
  }
}
