import { describe, expect, it } from "vitest";
import { RoomCreationRegistry } from "./room-creation.js";

describe("RoomCreationRegistry", () => {
  it("issues one-use, set-bound, expiring proofs", () => {
    const registry = new RoomCreationRegistry();
    const token = registry.issue("set-a", 1_000);
    expect(registry.consume(token, "set-b", 1_001)).toBe(false);
    expect(registry.consume(token, "set-a", 1_001)).toBe(false);

    const valid = registry.issue("set-a", 2_000);
    expect(registry.consume(valid, "set-a", 2_001)).toBe(true);
    expect(registry.consume(valid, "set-a", 2_002)).toBe(false);

    const expired = registry.issue("set-a", 3_000);
    expect(registry.consume(expired, "set-a", 33_001)).toBe(false);
  });
});
