import { StateDatabase } from "./stateDatabase";

export class CacheStore {
  private stateDbPromise?: Promise<StateDatabase>;

  private getStateDb(): Promise<StateDatabase> {
    if (!this.stateDbPromise) {
      this.stateDbPromise = StateDatabase.open();
    }
    return this.stateDbPromise;
  }

  async hasProposal(projectId: number, accountId = "default"): Promise<boolean> {
    const db = await this.getStateDb();
    return db.hasProposal(accountId, projectId);
  }

  async markProposal(projectId: number, accountId = "default"): Promise<void> {
    const db = await this.getStateDb();
    await db.markProposal(accountId, projectId);
  }

  async hasMessageHash(hash: string, accountId = "default"): Promise<boolean> {
    const db = await this.getStateDb();
    return db.hasMessageHash(accountId, hash);
  }

  async markMessageHash(hash: string, accountId = "default"): Promise<void> {
    const db = await this.getStateDb();
    await db.markMessageHash(accountId, hash);
  }
}
