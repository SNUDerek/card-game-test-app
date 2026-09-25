import { useMemo } from "react";
import type { CardDefinition, CardFace } from "@card-table/shared";
import {
  ART_HEIGHT,
  BODY_HEIGHT,
  BODY_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
} from "../../cards/CardRenderer";
import { BODY_LINE_HEIGHT, fitBodyFontSize } from "../../cards/fit-text";
import { MAGNIFY_SCALE } from "../../state/local-ui-state";
import "./MagnifyPreview.css";

export interface PreviewBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MagnifyPreviewProps {
  definition: CardDefinition;
  face: CardFace;
  bounds: PreviewBounds;
}

/** Gap kept between the preview and the edge of the tabletop, in screen px. */
const VIEWPORT_MARGIN = 8;

/**
 * Places the preview centred over the card it describes, nudged back inside the
 * tabletop when the card sits near an edge.
 *
 * These bounds are also what decides dismissal: the pointer leaving them clears
 * the preview. Because the preview is larger than the card at any magnification
 * above 1×, dismissing on leaving the *card* instead would hide it while the
 * pointer was still visually over it.
 */
export function getPreviewBounds(
  cardScreenCenter: { x: number; y: number },
  container: { width: number; height: number },
  scale: number = MAGNIFY_SCALE,
): PreviewBounds {
  const width = CARD_WIDTH * scale;
  const height = CARD_HEIGHT * scale;
  // A preview larger than the tabletop cannot satisfy both margins; pinning it
  // to the top-left keeps the card's name and type on screen.
  const maxLeft = Math.max(VIEWPORT_MARGIN, container.width - width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, container.height - height - VIEWPORT_MARGIN);

  return {
    left: Math.min(Math.max(cardScreenCenter.x - width / 2, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(cardScreenCenter.y - height / 2, VIEWPORT_MARGIN), maxTop),
    width,
    height,
  };
}

export function isWithinPreview(point: { x: number; y: number }, bounds: PreviewBounds): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.left + bounds.width &&
    point.y >= bounds.top &&
    point.y <= bounds.top + bounds.height
  );
}

/**
 * Local-only magnified view of a card. It is a DOM overlay rather than a Konva
 * node so it never participates in tabletop hit-testing, and it reads only from
 * the immutable definition plus the card's synchronized face — showing it never
 * mutates canonical card state and never sends a command.
 */
export function MagnifyPreview({ definition, face, bounds }: MagnifyPreviewProps) {
  const scale = bounds.width / CARD_WIDTH;
  const bodyFontSize = useMemo(
    () => fitBodyFontSize(definition.body, BODY_WIDTH, BODY_HEIGHT),
    [definition.body],
  );

  const label = `Magnified preview of ${face === "back" ? "a face-down card" : definition.name}`;

  return (
    <div
      className="magnify-preview"
      role="img"
      aria-label={label}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      {face === "back" ? (
        <div className="magnify-preview-back">Card Back</div>
      ) : (
        <>
          <img
            className="magnify-preview-art"
            src={definition.imageUrl}
            alt=""
            style={{ height: ART_HEIGHT * scale }}
          />
          <div className="magnify-preview-info" style={{ padding: 10 * scale }}>
            <div className="magnify-preview-name" style={{ fontSize: 16 * scale }}>
              {definition.name}
            </div>
            <div className="magnify-preview-type" style={{ fontSize: 12 * scale }}>
              {definition.type}
            </div>
            <div
              className="magnify-preview-body"
              style={{
                width: BODY_WIDTH * scale,
                maxHeight: BODY_HEIGHT * scale,
                fontSize: bodyFontSize * scale,
                lineHeight: BODY_LINE_HEIGHT,
              }}
            >
              {definition.body}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
