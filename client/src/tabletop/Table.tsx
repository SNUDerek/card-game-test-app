import { Stage, Layer, Rect, Group } from "react-konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, getCardOrientationAction } from "./Card";
import type { CardDefinition } from "@card-table/shared";
import { DEFAULT_VIEWPORT, screenToWorld, worldToScreen } from "./viewport";
import { useCardCatalog } from "../features/card-browser/CardCatalogContext";
import { CARD_DEFINITION_MIME_TYPE } from "../features/card-browser/CardBrowser";
import { useMultiplayer } from "../multiplayer/MultiplayerContext";
import { useCardDrag } from "./interactions/drag";
import { useInterpolatedCardPositions } from "./interactions/interpolation";
import { getPreviewSide, MagnifyPreview } from "../features/tabletop/MagnifyPreview";
import { useLocalUiState } from "../state/local-ui-state";

export function Table() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { definitionsById } = useCardCatalog();
  const multiplayer = useMultiplayer();
  const { cards, connectionError, spawnCard } = multiplayer;
  const interpolatedPositions = useInterpolatedCardPositions(cards);
  const drag = useCardDrag(multiplayer);
  const { magnifiedCardId, magnifyCard, unmagnifyCard } = useLocalUiState();
  const [cardMenu, setCardMenu] = useState<{ cardId: string; x: number; y: number } | null>(
    null,
  );
  // The menu acts on live card state, so it closes itself if the card is
  // deleted or restacked by another player while it is open.
  const menuCard = cardMenu ? cards.find((card) => card.id === cardMenu.cardId) : undefined;

  const magnified = useMemo(() => {
    const card = cards.find((candidate) => candidate.id === magnifiedCardId);
    const definition = card && definitionsById.get(card.definitionId);
    if (!card || !definition) return null;
    // Card instance coordinates anchor the centered Konva group (see Card's
    // offset), so they already represent the card center in world space.
    const center = worldToScreen({ x: card.x, y: card.y }, DEFAULT_VIEWPORT);
    return { definition, face: card.face, side: getPreviewSide(center.x, size.width) };
  }, [cards, definitionsById, magnifiedCardId, size.width]);

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
      onPointerDown={() => setCardMenu(null)}
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
                      onFlip={(cardId) => {
                        void multiplayer.flipCard(cardId).catch((cause: unknown) => {
                          console.warn("Card flip rejected:", cause);
                        });
                      }}
                      onContextMenu={(cardId, position) => {
                        setCardMenu({ cardId, ...position });
                      }}
                      onHoverStart={magnifyCard}
                      onHoverEnd={unmagnifyCard}
                      onBringToFront={(cardId) => {
                        void multiplayer.bringToFront(cardId).catch((cause: unknown) => {
                          console.warn("Bring-to-front rejected:", cause);
                        });
                      }}
                    />
                  );
                })}
            </Group>
          </Layer>
        </Stage>
      )}
      {magnified && (
        <MagnifyPreview
          definition={magnified.definition}
          face={magnified.face}
          side={magnified.side}
        />
      )}
      {connectionError && <p className="tabletop-error">{connectionError}</p>}
      {cardMenu && menuCard && (
        <div
          className="card-context-menu"
          role="menu"
          style={{ left: cardMenu.x, top: cardMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const command = getCardOrientationAction(menuCard.orientation) === "untap"
                ? multiplayer.untapCard
                : multiplayer.tapCard;
              void command(cardMenu.cardId).catch((cause: unknown) => {
                console.warn("Card orientation change rejected:", cause);
              });
              setCardMenu(null);
            }}
          >
            {menuCard.orientation === "tapped" ? "Untap" : "Tap"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              void multiplayer.deleteCard(cardMenu.cardId).catch((cause: unknown) => {
                console.warn("Card deletion rejected:", cause);
              });
              setCardMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
