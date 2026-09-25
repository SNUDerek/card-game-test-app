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

export type PreviewSide = "left" | "right";

interface MagnifyPreviewProps {
  definition: CardDefinition;
  face: CardFace;
  side: PreviewSide;
  scale?: number;
}

/**
 * Keeps the preview clear of the card it describes by showing it on the
 * opposite half of the tabletop.
 */
export function getPreviewSide(cardScreenX: number, containerWidth: number): PreviewSide {
  return cardScreenX > containerWidth / 2 ? "left" : "right";
}

/**
 * Local-only magnified view of a card. It is a DOM overlay rather than a Konva
 * node so it never participates in tabletop hit-testing, and it reads only from
 * the immutable definition plus the card's synchronized face — showing it never
 * mutates canonical card state and never sends a command.
 */
export function MagnifyPreview({
  definition,
  face,
  side,
  scale = MAGNIFY_SCALE,
}: MagnifyPreviewProps) {
  const bodyFontSize = useMemo(
    () => fitBodyFontSize(definition.body, BODY_WIDTH, BODY_HEIGHT),
    [definition.body],
  );

  const label = `Magnified preview of ${face === "back" ? "a face-down card" : definition.name}`;

  return (
    <div
      className={`magnify-preview magnify-preview-${side}`}
      role="img"
      aria-label={label}
      style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale }}
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
