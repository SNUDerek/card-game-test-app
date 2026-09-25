import { describe, expect, it } from "vitest";
import { interpolatePosition } from "./interpolation";

describe("remote movement interpolation", () => {
  it("interpolates and clamps between authoritative positions", () => {
    expect(interpolatePosition({ x: 0, y: 20 }, { x: 100, y: 60 }, 0.5)).toEqual({
      x: 50,
      y: 40,
    });
    expect(interpolatePosition({ x: 0, y: 20 }, { x: 100, y: 60 }, -1)).toEqual({
      x: 0,
      y: 20,
    });
    expect(interpolatePosition({ x: 0, y: 20 }, { x: 100, y: 60 }, 2)).toEqual({
      x: 100,
      y: 60,
    });
  });
});
