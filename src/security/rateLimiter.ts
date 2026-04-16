import { RateLimitError } from "../domain/errors";

type Counter = {
  count: number;
  windowStartMs: number;
};

export class RateLimiter {
  private readonly counters = new Map<string, Counter>();
  private readonly perMinute: number;

  constructor(perMinute: number) {
    this.perMinute = perMinute;
  }

  consume(key: string): void {
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
