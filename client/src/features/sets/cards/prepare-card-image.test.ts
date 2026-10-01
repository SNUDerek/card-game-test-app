import { describe, expect, it } from "vitest";
import { CARD_IMAGE_MAX_SIZE, CARD_IMAGE_MIN_SIZE } from "@card-table/shared";
import { CardImageError, planCardImage } from "./prepare-card-image";

describe("planCardImage", () => {
  it("cuts the centered square from a landscape image", () => {
    expect(planCardImage(300, 200)).toEqual({
      crop: { sx: 50, sy: 0, size: 200 },
      outputSize: 200,
    });
  });

  it("cuts the centered square from a portrait image", () => {
    expect(planCardImage(101, 300)).toEqual({
      crop: { sx: 0, sy: 99, size: 101 },
      outputSize: 101,
    });
  });

  it("scales large images down to the maximum, never up", () => {
    expect(planCardImage(2000, 1500).outputSize).toBe(CARD_IMAGE_MAX_SIZE);
    expect(planCardImage(CARD_IMAGE_MIN_SIZE, 400).outputSize).toBe(CARD_IMAGE_MIN_SIZE);
  });

  it("rejects images too small to meet the minimum", () => {
    expect(() => planCardImage(400, CARD_IMAGE_MIN_SIZE - 1)).toThrow(CardImageError);
    expect(() => planCardImage(0, 0)).toThrow(CardImageError);
  });
});
