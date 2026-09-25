import { describe, expect, it } from "vitest";
import { CommandRateLimiter, DEFAULT_COMMAND_RATE_LIMIT } from "./rate-limit.js";

describe("CommandRateLimiter", () => {
  it("allows a burst and then refuses further commands at the same instant", () => {
    const limiter = new CommandRateLimiter({ burst: 3, perSecond: 10 });
    expect([0, 0, 0].map(() => limiter.tryConsume("a", 1_000))).toEqual([true, true, true]);
    expect(limiter.tryConsume("a", 1_000)).toBe(false);
  });

  it("refills at the configured rate", () => {
    const limiter = new CommandRateLimiter({ burst: 2, perSecond: 10 });
    limiter.tryConsume("a", 0);
    limiter.tryConsume("a", 0);
    expect(limiter.tryConsume("a", 50)).toBe(false);
    // 10/s means one token back after 100ms.
    expect(limiter.tryConsume("a", 100)).toBe(true);
  });

  it("never refills beyond the burst allowance", () => {
    const limiter = new CommandRateLimiter({ burst: 2, perSecond: 100 });
    limiter.tryConsume("a", 0);
    expect([0, 0].map(() => limiter.tryConsume("a", 60_000))).toEqual([true, true]);
    expect(limiter.tryConsume("a", 60_000)).toBe(false);
  });

  it("budgets each connection independently and forgets departed ones", () => {
    const limiter = new CommandRateLimiter({ burst: 1, perSecond: 1 });
    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("b", 0)).toBe(true);
    expect(limiter.tryConsume("a", 0)).toBe(false);

    limiter.forget("a");
    expect(limiter.tryConsume("a", 0)).toBe(true);
  });

  it("leaves headroom over the 20 Hz drag update rate", () => {
    const limiter = new CommandRateLimiter(DEFAULT_COMMAND_RATE_LIMIT);
    // Five seconds of dragging at 20 Hz must never be throttled.
    for (let tick = 0; tick < 100; tick += 1) {
      expect(limiter.tryConsume("dragger", tick * 50)).toBe(true);
    }
  });
});
