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

export function Card({ definition, x, y, face, orientation }: CardProps) {
  // If tapped, rotate 90 degrees around center
  const rotation = orientation === "tapped" ? 90 : 0;
  
  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      // Set offset to center so rotation revolves around center
      offsetX={rotation ? CARD_WIDTH / 2 : 0}
      offsetY={rotation ? CARD_HEIGHT / 2 : 0}
    >
      <CardRenderer definition={definition} face={face} />
    </Group>
  );
}
