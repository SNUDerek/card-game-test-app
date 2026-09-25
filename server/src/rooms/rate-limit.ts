/**
 * Per-connection token bucket over command handling.
 *
 * Dragging sends roughly 20 movement commands a second, so the sustained rate
 * has to sit comfortably above that while still bounding what a misbehaving or
 * malicious client can force the room to process. The burst allowance covers
 * the short flurries that a drag start or a stack operation produces.
 */
export interface RateLimitOptions {
  /** Commands allowed back-to-back before the sustained rate applies. */
  burst: number;
  /** Long-run commands per second, once the burst allowance is spent. */
  perSecond: number;
}

export const DEFAULT_COMMAND_RATE_LIMIT: RateLimitOptions = { burst: 120, perSecond: 60 };

export class CommandRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(private readonly options: RateLimitOptions = DEFAULT_COMMAND_RATE_LIMIT) {}

  /** Spends one token, or returns false when the connection is over budget. */
  tryConsume(key: string, now: number): boolean {
    const { burst, perSecond } = this.options;
    if (burst <= 0) return false;

    const bucket = this.buckets.get(key) ?? { tokens: burst, updatedAt: now };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
    const tokens = Math.min(burst, bucket.tokens + elapsedSeconds * perSecond);

    if (tokens < 1) {
      // Keep the refill clock running so a throttled client still recovers.
      this.buckets.set(key, { tokens, updatedAt: now });
      return false;
    }
    this.buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    return true;
  }

  /** Drops a departed connection's bucket so the map cannot grow unbounded. */
  forget(key: string): void {
    this.buckets.delete(key);
  }
}
