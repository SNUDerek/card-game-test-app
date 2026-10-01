import { describe, expect, it } from "vitest";
import { SetUsageRegistry } from "./set-usage.js";

describe("SetUsageRegistry", () => {
  it("keeps a set in use until its last room is released", () => {
    const usage = new SetUsageRegistry();
    usage.acquire("set-a", "room-1");
    usage.acquire("set-a", "room-2");
    usage.acquire("set-b", "room-3");

    expect(usage.roomsUsing("set-a")).toEqual(["room-1", "room-2"]);
    expect(usage.setUsedBy("room-3")).toBe("set-b");

    usage.release("room-1");
    expect(usage.isInUse("set-a")).toBe(true);
    usage.release("room-2");
    expect(usage.isInUse("set-a")).toBe(false);
    expect(usage.roomsUsing("set-a")).toEqual([]);
    expect(usage.isInUse("set-b")).toBe(true);
  });

  it("treats repeated acquires and releases as no-ops", () => {
    const usage = new SetUsageRegistry();
    usage.acquire("set-a", "room-1");
    usage.acquire("set-a", "room-1");
    usage.release("room-1");
    usage.release("room-1");
    usage.release("never-registered");
    expect(usage.isInUse("set-a")).toBe(false);
  });

  it("refuses to rebind a room to a different set", () => {
    const usage = new SetUsageRegistry();
    usage.acquire("set-a", "room-1");
    expect(() => usage.acquire("set-b", "room-1")).toThrow(/already uses/);
    expect(usage.isInUse("set-b")).toBe(false);
  });
});
