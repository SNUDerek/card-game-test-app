import { Group } from "react-konva";
import type { CardDefinition, CardInstance, CardStack } from "@card-table/shared";
import { CardRenderer } from "../cards/CardRenderer";
import { STACK_OFFSET } from "./interactions/snap-detection";
import { CARD_HEIGHT, CARD_WIDTH } from "../cards/CardRenderer";
import type { Point } from "./viewport";

export function Stack({
  stack, cards, definitionsById, position, onDragStart, onDragMove, onDragEnd,
  onTopFlip, onTopContextMenu,
}: {
  stack: CardStack;
  cards: ReadonlyMap<string, CardInstance>;
  definitionsById: ReadonlyMap<string, CardDefinition>;
  position: Point;
  onDragStart(stackId: string, position: Point): void;
  onDragMove(stackId: string, position: Point): void;
  onDragEnd(stackId: string, position: Point): void;
  onTopFlip(cardId: string): void;
  onTopContextMenu(cardId: string, stackId: string, position: Point): void;
}) {
  const topId = stack.cardIds.at(-1);
  return <Group x={position.x} y={position.y} draggable
    onDragStart={() => onDragStart(stack.id, position)}
    onDragMove={(event) => onDragMove(stack.id, event.target.position())}
    onDragEnd={(event) => onDragEnd(stack.id, event.target.position())}>
    {stack.cardIds.map((cardId, index) => {
      const card = cards.get(cardId);
      const definition = card && definitionsById.get(card.definitionId);
      if (!card || !definition) return null;
      return <Group key={cardId}
        x={index * STACK_OFFSET}
        y={index * STACK_OFFSET}
        rotation={card.orientation === "tapped" ? 90 : 0}
        onDblClick={() => cardId === topId && onTopFlip(cardId)}
        onContextMenu={(event) => {
          if (cardId !== topId) return;
          event.evt.preventDefault();
          onTopContextMenu(cardId, stack.id, { x: event.evt.clientX, y: event.evt.clientY });
        }}>
        <Group x={-CARD_WIDTH / 2} y={-CARD_HEIGHT / 2}>
          <CardRenderer definition={definition} face={card.face} />
        </Group>
      </Group>;
    })}
  </Group>;
}
