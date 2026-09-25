import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH } from "../cards/CardRenderer";
import { getCardTransform } from "./Card";

describe("card transforms", () => {
  it.each([
    ["upright", 0],
    ["tapped", 90],
  ] as const)("keeps %s cards anchored at their center", (orientation, rotation) => {
    expect(getCardTransform(orientation)).toEqual({
      rotation,
      offsetX: CARD_WIDTH / 2,
      offsetY: CARD_HEIGHT / 2,
    });
  });
});
