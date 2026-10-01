import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords.js";

describe("password hashing", () => {
  it("uses a unique salt and requires the correct password and pepper", async () => {
    const first = await hashPassword("same password", "pepper");
    const second = await hashPassword("same password", "pepper");
    expect(first).not.toEqual(second);
    expect(await verifyPassword("same password", "pepper", first.hash, first.salt)).toBe(true);
    expect(await verifyPassword("wrong password", "pepper", first.hash, first.salt)).toBe(false);
    expect(await verifyPassword("same password", "wrong pepper", first.hash, first.salt)).toBe(false);
  });
});
