import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

type CachePayload = {
  sentProposalsByProjectId: number[];
  sentMessageHashes: string[];
};

const defaults: CachePayload = {
  sentProposalsByProjectId: [],
  sentMessageHashes: [],
};

export class CacheStore {
  private readonly filePath: string;

  constructor(filePath = process.env.CACHE_FILE ?? ".data/cache.json") {
    this.filePath = filePath;
  }

  private async read(): Promise<CachePayload> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return { ...defaults, ...(JSON.parse(raw) as CachePayload) };
    } catch {
      return { ...defaults };
    }
  }

  private async write(data: CachePayload): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async hasProposal(projectId: number): Promise<boolean> {
    const cache = await this.read();
    return cache.sentProposalsByProjectId.includes(projectId);
  }

  async markProposal(projectId: number): Promise<void> {
    const cache = await this.read();
    if (!cache.sentProposalsByProjectId.includes(projectId)) {
      cache.sentProposalsByProjectId.push(projectId);
      await this.write(cache);
    }
  }

  async hasMessageHash(hash: string): Promise<boolean> {
    const cache = await this.read();
    return cache.sentMessageHashes.includes(hash);
  }

  async markMessageHash(hash: string): Promise<void> {
    const cache = await this.read();
    if (!cache.sentMessageHashes.includes(hash)) {
      cache.sentMessageHashes.push(hash);
      await this.write(cache);
    }
  }
}
