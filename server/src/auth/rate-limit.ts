interface Bucket {
  count: number;
  resetAt: number;
}

export class AuthRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit = 10,
    private readonly windowMs = 15 * 60 * 1_000,
  ) {}

  allow(keys: string[], now = Date.now()): boolean {
    this.pruneExpired(now);
    const active = keys.map((key) => {
      const existing = this.buckets.get(key);
      if (!existing || existing.resetAt <= now) return { key, bucket: { count: 0, resetAt: now + this.windowMs } };
      return { key, bucket: existing };
    });
    if (active.some(({ bucket }) => bucket.count >= this.limit)) return false;
    for (const { key, bucket } of active) {
      bucket.count += 1;
      this.buckets.set(key, bucket);
    }
    return true;
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

