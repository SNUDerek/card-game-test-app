import { Group } from "react-konva";
import { CardRenderer, CARD_WIDTH, CARD_HEIGHT } from "../cards/CardRenderer";
import type { CardDefinition, CardFace, CardOrientation } from "@card-table/shared";
import type { Point } from "./viewport";

interface CardProps {
  definition: CardDefinition;
  x: number;
  y: number;
  face: CardFace;
  orientation: CardOrientation;
  id: string;
  onDragStart?(cardId: string, position: Point): void;
  onDragMove?(cardId: string, position: Point): void;
  onDragEnd?(cardId: string, position: Point): void;
}

export function getCardTransform(orientation: CardOrientation) {
  return {
    rotation: orientation === "tapped" ? 90 : 0,
    offsetX: CARD_WIDTH / 2,
    offsetY: CARD_HEIGHT / 2,
  } as const;
}

export function Card({
  definition,
  id,
  x,
  y,
  face,
  orientation,
  onDragStart,
  onDragMove,
  onDragEnd,
}: CardProps) {
  const transform = getCardTransform(orientation);

  return (
    <Group
      x={x}
      y={y}
      rotation={transform.rotation}
      offsetX={transform.offsetX}
      offsetY={transform.offsetY}
      draggable
      onDragStart={() => onDragStart?.(id, { x, y })}
      onDragMove={(event) => onDragMove?.(id, event.target.position())}
      onDragEnd={(event) => onDragEnd?.(id, event.target.position())}
    >
      <CardRenderer definition={definition} face={face} />
    </Group>
  );
}
