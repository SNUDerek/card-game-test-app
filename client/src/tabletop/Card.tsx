import { Group } from "react-konva";
import { CardRenderer, CARD_WIDTH, CARD_HEIGHT } from "../cards/CardRenderer";
import type { CardDefinition, CardFace, CardOrientation } from "@card-table/shared";

interface CardProps {
  definition: CardDefinition;
  x: number;
  y: number;
  face: CardFace;
  orientation: CardOrientation;
}

export function getCardTransform(orientation: CardOrientation) {
  return {
    rotation: orientation === "tapped" ? 90 : 0,
    offsetX: CARD_WIDTH / 2,
    offsetY: CARD_HEIGHT / 2,
  } as const;
}

export function Card({ definition, x, y, face, orientation }: CardProps) {
  const transform = getCardTransform(orientation);

  return (
    <Group
      x={x}
      y={y}
      rotation={transform.rotation}
      offsetX={transform.offsetX}
      offsetY={transform.offsetY}
    >
      <CardRenderer definition={definition} face={face} />
    </Group>
  );
}
