import { describe, expect, it } from "vitest";
import { ROOM_COMMANDS, TABLE_COMMANDS } from "@card-table/shared";
import {
  DEFAULT_ROOM_IDLE_TIMEOUT_MINUTES,
  RoomIdleTimeout,
  countsAsActivity,
  parseIdleTimeoutMinutes,
} from "./idle-timeout.js";

const MINUTE = 60_000;

describe("countsAsActivity", () => {
  it("counts table changes but not claims, releases, hover, or session lookups", () => {
    expect(countsAsActivity(TABLE_COMMANDS.MOVE_CARD)).toBe(true);
    expect(countsAsActivity(TABLE_COMMANDS.SPAWN_DECK)).toBe(true);
    expect(countsAsActivity(TABLE_COMMANDS.FLIP_CARD)).toBe(true);
    expect(countsAsActivity(TABLE_COMMANDS.CLAIM_OBJECT)).toBe(false);
    expect(countsAsActivity(TABLE_COMMANDS.RELEASE_OBJECT)).toBe(false);
    expect(countsAsActivity(TABLE_COMMANDS.SET_HOVER)).toBe(false);
    expect(countsAsActivity(ROOM_COMMANDS.SESSION)).toBe(false);
  });
});

describe("RoomIdleTimeout", () => {
  it("warns once at the warning threshold, then expires at the deadline", () => {
    const idle = new RoomIdleTimeout({ timeoutMs: 120 * MINUTE }, 0);

    expect(idle.poll(114 * MINUTE)).toEqual({ kind: "none" });
    expect(idle.poll(115 * MINUTE)).toEqual({ kind: "warn", endsAt: 120 * MINUTE });
    expect(idle.poll(116 * MINUTE)).toEqual({ kind: "none" });
    expect(idle.poll(120 * MINUTE)).toEqual({ kind: "expire" });
  });

  it("restarts the clock on activity and reports a cancelled warning", () => {
    const idle = new RoomIdleTimeout({ timeoutMs: 10 * MINUTE, warningMs: 2 * MINUTE }, 0);

    expect(idle.recordActivity(1 * MINUTE)).toBe(false);
    expect(idle.poll(9 * MINUTE)).toEqual({ kind: "warn", endsAt: 11 * MINUTE });
    expect(idle.recordActivity(10 * MINUTE)).toBe(true);
    expect(idle.endsAt).toBe(20 * MINUTE);
    expect(idle.poll(11 * MINUTE)).toEqual({ kind: "none" });
    // A fresh idle period gets a fresh warning.
    expect(idle.poll(18 * MINUTE)).toEqual({ kind: "warn", endsAt: 20 * MINUTE });
  });

  it("ignores activity reported out of order", () => {
    const idle = new RoomIdleTimeout({ timeoutMs: 10 * MINUTE }, 5 * MINUTE);
    idle.recordActivity(1 * MINUTE);
    expect(idle.endsAt).toBe(15 * MINUTE);
  });

  it("clamps a warning longer than the timeout", () => {
    const idle = new RoomIdleTimeout({ timeoutMs: 3 * MINUTE }, 0);
    expect(idle.poll(0)).toEqual({ kind: "warn", endsAt: 3 * MINUTE });
  });

  it("rejects a non-positive timeout", () => {
    expect(() => new RoomIdleTimeout({ timeoutMs: 0 }, 0)).toThrow(RangeError);
  });
});

describe("parseIdleTimeoutMinutes", () => {
  it("defaults when unset or blank", () => {
    expect(parseIdleTimeoutMinutes(undefined)).toBe(DEFAULT_ROOM_IDLE_TIMEOUT_MINUTES);
    expect(parseIdleTimeoutMinutes("  ")).toBe(DEFAULT_ROOM_IDLE_TIMEOUT_MINUTES);
  });

  it("accepts positive numbers and rejects anything else", () => {
    expect(parseIdleTimeoutMinutes("30")).toBe(30);
    expect(() => parseIdleTimeoutMinutes("0")).toThrow("positive number");
    expect(() => parseIdleTimeoutMinutes("soon")).toThrow("positive number");
  });
});
