import { useMemo } from "react";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";
import type { CardDefinition, CardFace } from "@card-table/shared";
import { useImage } from "../hooks/useImage";
import { BODY_LINE_HEIGHT, fitBodyFontSize } from "./fit-text";

interface CardRendererProps {
  definition: CardDefinition;
  face: CardFace;
}

export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 280;
export const ART_HEIGHT = 140;
const BODY_WIDTH = CARD_WIDTH - 20;
const BODY_HEIGHT = CARD_HEIGHT - ART_HEIGHT - 65;

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
          stroke="#475569"
          strokeWidth={2}
        />
        <Rect
          x={10}
          y={10}
          width={CARD_WIDTH - 20}
          height={CARD_HEIGHT - 20}
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
        stroke="#cbd5e1"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={4}
        shadowOpacity={0.2}
        shadowOffset={{ x: 2, y: 2 }}
      />
      
      <Group clipX={0} clipY={0} clipWidth={CARD_WIDTH} clipHeight={ART_HEIGHT}>
        {image ? (
          <KonvaImage
            image={image}
            width={CARD_WIDTH}
            height={ART_HEIGHT}
            imageSmoothingEnabled={false}
          />
        ) : (
          <Rect width={CARD_WIDTH} height={ART_HEIGHT} fill="#e2e8f0" />
        )}
      </Group>

      <Rect
        x={0}
        y={0}
        width={CARD_WIDTH}
        height={ART_HEIGHT}
        stroke="#94a3b8"
        strokeWidth={1}
      />

      <Text
        x={10}
        y={ART_HEIGHT + 10}
        width={CARD_WIDTH - 20}
        text={definition.name}
        fontSize={16}
        fontStyle="bold"
        fill="#0f172a"
      />
      
      <Text
        x={10}
        y={ART_HEIGHT + 30}
        width={CARD_WIDTH - 20}
        text={definition.type}
        fontSize={12}
        fontStyle="italic"
        fill="#475569"
      />

      <Group
        x={10}
        y={ART_HEIGHT + 55}
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
