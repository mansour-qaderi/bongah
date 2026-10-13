/**
 * A sliding-window counter: at most `limit` hits per `windowMs` per key. In memory, so per server
 * instance (like the Throttler used for REST); move to a shared store when more than one runs.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit and returns true, or returns false (recording nothing) when the key is over its limit. */
  tryAcquire(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(cutoff);
    return true;
  }

  /** Seconds until the oldest hit leaves the window (when `tryAcquire` can succeed again). */
  retryAfterSeconds(key: string, now: number = Date.now()): number {
    const oldest = this.hits.get(key)?.find((at) => at > now - this.windowMs);
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
  }

  private sweep(cutoff: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => at <= cutoff)) this.hits.delete(key);
    }
  }
}
