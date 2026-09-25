import { describe, expect, it } from "vitest";
import { hashRoomPassword, verifyRoomPassword } from "./room-access.js";

describe("room passwords", () => {
  it("accepts any connection to an unprotected room", () => {
    expect(verifyRoomPassword(undefined, undefined)).toBe(true);
    expect(verifyRoomPassword(undefined, "anything")).toBe(true);
  });

  it("accepts only the correct password for a protected room", () => {
    const stored = hashRoomPassword("open-sesame");

    expect(verifyRoomPassword(stored, "open-sesame")).toBe(true);
    expect(verifyRoomPassword(stored, "Open-Sesame")).toBe(false);
    expect(verifyRoomPassword(stored, "")).toBe(false);
    expect(verifyRoomPassword(stored, undefined)).toBe(false);
  });

  it("salts each hash so identical passwords do not share a key", () => {
    const first = hashRoomPassword("same");
    const second = hashRoomPassword("same");

    expect(first.salt).not.toEqual(second.salt);
    expect(first.key).not.toEqual(second.key);
    expect(verifyRoomPassword(second, "same")).toBe(true);
  });
});
