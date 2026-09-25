import Konva from "konva";

export const MAX_BODY_FONT_SIZE = 14;
export const MIN_BODY_FONT_SIZE = 8;
export const BODY_LINE_HEIGHT = 1.4;

/**
 * Finds the largest font size (between MIN/MAX_BODY_FONT_SIZE) at which
 * `text` wraps to fit within `width` x `maxHeight`, per the card body's
 * shrink-then-clip behavior. Falls back to the minimum size if the text
 * still won't fit — remaining overflow is clipped by the caller.
 */
export function fitBodyFontSize(text: string, width: number, maxHeight: number): number {
  const measurer = new Konva.Text({
    text,
    width,
    lineHeight: BODY_LINE_HEIGHT,
  });

  for (let fontSize = MAX_BODY_FONT_SIZE; fontSize > MIN_BODY_FONT_SIZE; fontSize--) {
    measurer.fontSize(fontSize);
    if (measurer.height() <= maxHeight) {
      return fontSize;
    }
  }

  return MIN_BODY_FONT_SIZE;
}
