import { Group } from "react-konva";
import type { CardDefinition, CardInstance, CardStack } from "@card-table/shared";
import { CardRenderer } from "../cards/CardRenderer";
import { STACK_OFFSET } from "./interactions/snap-detection";

export function Stack({ stack, cards, definitionsById }: {
  stack: CardStack;
  cards: ReadonlyMap<string, CardInstance>;
  definitionsById: ReadonlyMap<string, CardDefinition>;
}) {
  return <Group x={stack.x} y={stack.y}>
    {stack.cardIds.map((cardId, index) => {
      const card = cards.get(cardId);
      const definition = card && definitionsById.get(card.definitionId);
      if (!card || !definition) return null;
      return <Group key={cardId} x={index * STACK_OFFSET} y={index * STACK_OFFSET}>
        <CardRenderer definition={definition} face={card.face} />
      </Group>;
    })}
  </Group>;
}
