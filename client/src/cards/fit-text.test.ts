import { describe, expect, it, vi } from "vitest";

vi.mock("konva", () => ({
  default: {
    Text: class {
      private readonly text: string;
      private readonly width: number;
      private readonly lineHeight: number;
      private size = 12;

      constructor({ text, width, lineHeight }: Record<string, number | string>) {
        this.text = String(text);
        this.width = Number(width);
        this.lineHeight = Number(lineHeight);
      }

      fontSize(size: number) {
        this.size = size;
      }

      height() {
        const approximateLineCount = Math.ceil((this.text.length * this.size * 0.5) / this.width);
        return approximateLineCount * this.size * this.lineHeight;
      }
    },
  },
}));

import { fitBodyFontSize, MAX_BODY_FONT_SIZE, MIN_BODY_FONT_SIZE } from "./fit-text";

describe("fitBodyFontSize", () => {
  it("uses the maximum size when the text fits", () => {
    expect(fitBodyFontSize("Short text", 180, 75)).toBe(MAX_BODY_FONT_SIZE);
  });

  it("falls back to the minimum size when text still overflows", () => {
    expect(fitBodyFontSize("long ".repeat(500), 80, 20)).toBe(MIN_BODY_FONT_SIZE);
  });
});
