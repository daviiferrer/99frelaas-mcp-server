import { RateLimitError } from "../domain/errors";

type Counter = {
  count: number;
  windowStartMs: number;
};

export type PersistentRateLimitStore = {
  consumeRateLimit: (rateKey: string, perMinute: number) => Promise<void>;
};

export class RateLimiter {
  private readonly counters = new Map<string, Counter>();
  private readonly perMinute: number;
  private readonly store?: PersistentRateLimitStore;

  constructor(perMinute: number, store?: PersistentRateLimitStore) {
    this.perMinute = perMinute;
    this.store = store;
  }

  async consume(key: string): Promise<void> {
    if (this.store) {
      await this.store.consumeRateLimit(key, this.perMinute);
      return;
    }

    const now = Date.now();
    const minute = 60_000;
    const current = this.counters.get(key);

    if (!current || now - current.windowStartMs >= minute) {
      this.counters.set(key, { count: 1, windowStartMs: now });
      return;
    }

    if (current.count >= this.perMinute) {
      throw new RateLimitError();
    }

    current.count += 1;
  }
}
