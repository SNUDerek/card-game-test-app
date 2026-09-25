import { Stage, Layer, Rect, Group } from "react-konva";
import { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import type { CardDefinition } from "@card-table/shared";
import { DEFAULT_VIEWPORT, screenToWorld } from "./viewport";
import { useCardCatalog } from "../features/card-browser/CardCatalogContext";
import { CARD_DEFINITION_MIME_TYPE } from "../features/card-browser/CardBrowser";
import { useMultiplayer } from "../multiplayer/MultiplayerContext";
import { useCardDrag } from "./interactions/drag";
import { useInterpolatedCardPositions } from "./interactions/interpolation";

export function Table() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { definitionsById } = useCardCatalog();
  const multiplayer = useMultiplayer();
  const { cards, connectionError, spawnCard } = multiplayer;
  const interpolatedPositions = useInterpolatedCardPositions(cards);
  const drag = useCardDrag(multiplayer);

  useEffect(() => {
    for (const card of cards) {
      const local = drag.localPositions[card.id];
      if (local && local.x === card.x && local.y === card.y) {
        drag.clearLocalPosition(card.id);
      }
    }
  }, [cards, drag.localPositions, drag.clearLocalPosition]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="tabletop-container"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(CARD_DEFINITION_MIME_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const definitionId = event.dataTransfer.getData(CARD_DEFINITION_MIME_TYPE);
        const container = containerRef.current;
        if (!definitionId || !container) return;
        const bounds = container.getBoundingClientRect();
        const position = screenToWorld(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          DEFAULT_VIEWPORT,
        );
        void spawnCard({ definitionId, ...position }).catch((cause: unknown) => {
          console.error("Failed to spawn card:", cause);
        });
      }}
    >
      {size.width > 0 && size.height > 0 && (
        <Stage width={size.width} height={size.height}>
          <Layer>
            <Rect width={size.width} height={size.height} fill="#0b3d24" />

            <Group
              x={DEFAULT_VIEWPORT.x}
              y={DEFAULT_VIEWPORT.y}
              scaleX={DEFAULT_VIEWPORT.scale}
              scaleY={DEFAULT_VIEWPORT.scale}
            >
              {[...cards]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((card) => {
                  const definition: CardDefinition | undefined = definitionsById.get(
                    card.definitionId,
                  );
                  if (!definition) return null;
                  const position = drag.localPositions[card.id] ??
                    interpolatedPositions[card.id] ?? { x: card.x, y: card.y };
                  return (
                    <Card
                      key={card.id}
                      definition={definition}
                      {...card}
                      {...position}
                      onDragStart={drag.startDrag}
                      onDragMove={drag.moveDrag}
                      onDragEnd={(cardId, nextPosition) => {
                        void drag.endDrag(cardId, nextPosition);
                      }}
                    />
                  );
                })}
            </Group>
          </Layer>
        </Stage>
      )}
      {connectionError && <p className="tabletop-error">{connectionError}</p>}
    </div>
  );
}
