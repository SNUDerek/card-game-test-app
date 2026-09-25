import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWPORT, screenToWorld, worldToScreen } from "./viewport";

describe("viewport coordinate conversion", () => {
  it("uses identity conversion for the default viewport", () => {
    const point = { x: 125, y: 240 };

    expect(screenToWorld(point, DEFAULT_VIEWPORT)).toEqual(point);
    expect(worldToScreen(point, DEFAULT_VIEWPORT)).toEqual(point);
  });

  it("round-trips points through a translated and scaled viewport", () => {
    const worldPoint = { x: 80, y: -25 };
    const viewport = { x: 120, y: 60, scale: 1.5 };

    expect(screenToWorld(worldToScreen(worldPoint, viewport), viewport)).toEqual(
      worldPoint,
    );
  });
});
