import { useMemo } from "react";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";
import type { CardDefinition, CardFace } from "@card-table/shared";
import { useImage } from "../hooks/useImage";
import { BODY_LINE_HEIGHT, fitBodyFontSize } from "./fit-text";

interface CardRendererProps {
  definition: CardDefinition;
  face: CardFace;
}

/**
 * Card geometry, in world units.
 *
 * CARD_WIDTH and CARD_HEIGHT are the card's footprint on the table and are
 * shared with hit-testing and snap geometry (see interactions/snap-detection),
 * so they must stay fixed. Interior padding is taken out of the content, never
 * added to the footprint.
 */
export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 280;
export const CARD_PADDING = 8;
export const CARD_BORDER_COLOR = "#0f172a";

export const ART_HEIGHT = 132;
const ART_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
const ART_BOTTOM = CARD_PADDING + ART_HEIGHT;
/** Artwork is square and centred in the art region. */
const ART_SIZE = ART_HEIGHT;
const ART_X = CARD_PADDING + (ART_WIDTH - ART_SIZE) / 2;

const NAME_Y = ART_BOTTOM + 10;
const TYPE_Y = ART_BOTTOM + 30;
const BODY_Y = ART_BOTTOM + 55;
export const BODY_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
export const BODY_HEIGHT = CARD_HEIGHT - CARD_PADDING - BODY_Y;

export function CardRenderer({ definition, face }: CardRendererProps) {
  const [image] = useImage(definition.imageUrl);
  const bodyFontSize = useMemo(
    () => fitBodyFontSize(definition.body, BODY_WIDTH, BODY_HEIGHT),
    [definition.body],
  );

  if (face === "back") {
    return (
      <Group>
        <Rect
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          fill="#1e293b"
          cornerRadius={8}
          stroke={CARD_BORDER_COLOR}
          strokeWidth={2}
        />
        <Rect
          x={CARD_PADDING}
          y={CARD_PADDING}
          width={CARD_WIDTH - CARD_PADDING * 2}
          height={CARD_HEIGHT - CARD_PADDING * 2}
          fill="transparent"
          stroke="#334155"
          strokeWidth={2}
          cornerRadius={4}
        />
        <Text
          text="CARD BACK"
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          align="center"
          verticalAlign="middle"
          fill="#94a3b8"
          fontSize={20}
          fontStyle="bold"
        />
      </Group>
    );
  }

  return (
    <Group>
      <Rect
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        fill="#f8fafc"
        cornerRadius={8}
        stroke={CARD_BORDER_COLOR}
        strokeWidth={2}
        shadowColor="black"
        shadowBlur={4}
        shadowOpacity={0.2}
        shadowOffset={{ x: 2, y: 2 }}
      />

      <Group
        clipX={CARD_PADDING}
        clipY={CARD_PADDING}
        clipWidth={ART_WIDTH}
        clipHeight={ART_HEIGHT}
      >
        {image ? (
          <KonvaImage
            image={image}
            x={ART_X}
            y={CARD_PADDING}
            width={ART_SIZE}
            height={ART_SIZE}
            imageSmoothingEnabled={false}
          />
        ) : (
          <Rect
            x={CARD_PADDING}
            y={CARD_PADDING}
            width={ART_WIDTH}
            height={ART_HEIGHT}
            fill="#e2e8f0"
          />
        )}
      </Group>

      <Rect
        x={CARD_PADDING}
        y={CARD_PADDING}
        width={ART_WIDTH}
        height={ART_HEIGHT}
        stroke="#94a3b8"
        strokeWidth={1}
      />

      <Text
        x={CARD_PADDING}
        y={NAME_Y}
        width={BODY_WIDTH}
        text={definition.name}
        fontSize={16}
        fontStyle="bold"
        fill="#0f172a"
      />

      <Text
        x={CARD_PADDING}
        y={TYPE_Y}
        width={BODY_WIDTH}
        text={definition.type}
        fontSize={12}
        fontStyle="italic"
        fill="#475569"
      />

      <Group
        x={CARD_PADDING}
        y={BODY_Y}
        clipX={0}
        clipY={0}
        clipWidth={BODY_WIDTH}
        clipHeight={BODY_HEIGHT}
      >
        <Text
          text={definition.body}
          width={BODY_WIDTH}
          fontSize={bodyFontSize}
          lineHeight={BODY_LINE_HEIGHT}
          fill="#334155"
        />
      </Group>
    </Group>
  );
}
