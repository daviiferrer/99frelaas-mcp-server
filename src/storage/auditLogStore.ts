import { StateDatabase } from "./stateDatabase";

export class AuditLogStore {
  private stateDbPromise?: Promise<StateDatabase>;

  private getStateDb(): Promise<StateDatabase> {
    if (!this.stateDbPromise) {
      this.stateDbPromise = StateDatabase.open();
    }
    return this.stateDbPromise;
  }

  async append(event: string, payload?: unknown): Promise<void> {
    const db = await this.getStateDb();
    await db.appendAudit(event, payload);
  }
}
