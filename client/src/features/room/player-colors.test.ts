import { describe, expect, it } from "vitest";
import { PLAYER_COLORS, playerColor } from "./player-colors";

describe("playerColor", () => {
  it("gives every player in a full palette a distinct colour", () => {
    const assigned = PLAYER_COLORS.map((_, joinOrder) => playerColor(joinOrder));
    expect(new Set(assigned).size).toBe(PLAYER_COLORS.length);
  });

  it("is derived purely from joinOrder, so every client agrees", () => {
    expect(playerColor(3)).toBe(playerColor(3));
    expect(playerColor(3)).toBe(PLAYER_COLORS[3]);
  });

  it("wraps once the palette runs out rather than returning nothing", () => {
    expect(playerColor(PLAYER_COLORS.length)).toBe(PLAYER_COLORS[0]);
    expect(playerColor(PLAYER_COLORS.length + 2)).toBe(PLAYER_COLORS[2]);
  });

  it("still returns a colour for an unexpected joinOrder", () => {
    expect(PLAYER_COLORS).toContain(playerColor(-1));
    expect(PLAYER_COLORS).toContain(playerColor(1.5));
  });
});
