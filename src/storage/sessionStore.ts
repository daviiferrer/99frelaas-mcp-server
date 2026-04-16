import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { SessionRecord } from "../auth/authTypes";

type SessionStoreFile = {
  activeSessionId?: string;
  sessions: SessionRecord[];
};

const defaultFile: SessionStoreFile = { sessions: [] };

export class SessionStore {
  private readonly filePath: string;

  constructor(filePath = process.env.SESSION_FILE ?? ".data/sessions.json") {
    this.filePath = filePath;
  }

  private async readStore(): Promise<SessionStoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SessionStoreFile;
    } catch {
      return { ...defaultFile };
    }
  }

  private async writeStore(data: SessionStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async getActive(): Promise<SessionRecord | undefined> {
    const store = await this.readStore();
    if (!store.activeSessionId) return undefined;
    return store.sessions.find((s) => s.sessionId === store.activeSessionId);
  }

  async save(record: SessionRecord): Promise<void> {
    const store = await this.readStore();
    const idx = store.sessions.findIndex((s) => s.sessionId === record.sessionId);
    if (idx >= 0) store.sessions[idx] = record;
    else store.sessions.push(record);
    store.activeSessionId = record.sessionId;
    await this.writeStore(store);
  }

  async clearActive(): Promise<void> {
    const store = await this.readStore();
    delete store.activeSessionId;
    await this.writeStore(store);
  }
}
