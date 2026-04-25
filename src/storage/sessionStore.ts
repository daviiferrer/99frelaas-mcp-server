import { SessionRecord } from "../auth/authTypes";
import { StateDatabase } from "./stateDatabase";

export class SessionStore {
  private stateDbPromise?: Promise<StateDatabase>;

  private getStateDb(): Promise<StateDatabase> {
    if (!this.stateDbPromise) {
      this.stateDbPromise = StateDatabase.open();
    }
    return this.stateDbPromise;
  }

  async getActive(accountId: string): Promise<SessionRecord | undefined> {
    const db = await this.getStateDb();
    return db.getActiveSession(accountId);
  }

  async save(record: SessionRecord, accountId: string): Promise<void> {
    const db = await this.getStateDb();
    await db.saveSession(accountId, record);
  }

  async clearActive(accountId: string): Promise<void> {
    const db = await this.getStateDb();
    await db.clearActiveSession(accountId);
  }

  async listSessions(): Promise<Array<{
    accountId: string;
    sessionId: string;
    userId?: string;
    username?: string;
    lastValidatedAt?: string;
    updatedAt: string;
    active: boolean;
    cookieNames: string[];
  }>> {
    const db = await this.getStateDb();
    return db.listSessions();
  }
}
