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
  onFlip?(cardId: string): void;
  onContextMenu?(cardId: string, position: Point): void;
  onBringToFront?(cardId: string): void;
  onHoverStart?(cardId: string): void;
  onHoverEnd?(cardId: string): void;
}

export function getCardTransform(orientation: CardOrientation) {
  return {
    rotation: orientation === "tapped" ? 90 : 0,
    offsetX: CARD_WIDTH / 2,
    offsetY: CARD_HEIGHT / 2,
  } as const;
}

export function getCardOrientationAction(orientation: CardOrientation): "tap" | "untap" {
  return orientation === "tapped" ? "untap" : "tap";
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
  onFlip,
  onContextMenu,
  onBringToFront,
  onHoverStart,
  onHoverEnd,
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
      onMouseEnter={() => onHoverStart?.(id)}
      onMouseLeave={() => onHoverEnd?.(id)}
      onDragStart={() => {
        onHoverEnd?.(id);
        onDragStart?.(id, { x, y });
      }}
      onDragMove={(event) => onDragMove?.(id, event.target.position())}
      onDragEnd={(event) => onDragEnd?.(id, event.target.position())}
      onDblClick={() => onFlip?.(id)}
      onDblTap={() => onFlip?.(id)}
      onContextMenu={(event) => {
        event.evt.preventDefault();
        onContextMenu?.(id, { x: event.evt.clientX, y: event.evt.clientY });
      }}
      onClick={() => onBringToFront?.(id)}
      onTap={() => onBringToFront?.(id)}
    >
      <CardRenderer definition={definition} face={face} />
    </Group>
  );
}
