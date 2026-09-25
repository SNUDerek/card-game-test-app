import { Stage, Layer, Rect, Group } from "react-konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "./Card";
import type { CardDefinition } from "@card-table/shared";
import { DEFAULT_VIEWPORT, screenToWorld, worldToScreen } from "./viewport";
import { useCardCatalog } from "../features/card-browser/CardCatalogContext";
import { CARD_DEFINITION_MIME_TYPE } from "../features/card-browser/CardBrowser";
import { useMultiplayer } from "../multiplayer/MultiplayerContext";
import { useCardDrag } from "./interactions/drag";
import { useInterpolatedCardPositions } from "./interactions/interpolation";
import {
  getPreviewBounds,
  isWithinPreview,
  MagnifyPreview,
} from "../features/tabletop/MagnifyPreview";
import { useLocalUiState } from "../state/local-ui-state";
import { Stack } from "./Stack";
import { findStackTarget, resolveStackTarget } from "./interactions/snap-detection";
import { useStackDrag } from "./interactions/stack-drag";
import { TableContextMenu, type CardMenuState } from "./TableContextMenu";
import { SnapTargetOutline } from "./SnapTargetOutline";
import { HoverAttribution, resolveHoverHighlights } from "./HoverAttribution";
import { resolveRenderedCardPositions } from "./card-positions";
import { useHoverReporter } from "./interactions/hover-reporter";

export function Table() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { definitionsById } = useCardCatalog();
  const multiplayer = useMultiplayer();
  const { cards, stacks, players, selfPlayerId, connectionError, spawnCard } = multiplayer;
  const hover = useHoverReporter(multiplayer);
  const drag = useCardDrag(multiplayer);
  const locallyDraggedIds = useMemo(
    () => new Set(Object.keys(drag.localPositions)),
    [drag.localPositions],
  );
  const interpolatedPositions = useInterpolatedCardPositions(cards, locallyDraggedIds);
  const stackDrag = useStackDrag(multiplayer);
  // One answer for where each card is drawn, shared by the cards themselves and
  // by everything that decorates them, so they cannot drift apart in motion.
  const renderedPositions = useMemo(
    () =>
      resolveRenderedCardPositions(cards, stacks, {
        dragged: drag.localPositions,
        interpolated: interpolatedPositions,
        draggedStacks: stackDrag.localPositions,
      }),
    [cards, stacks, drag.localPositions, interpolatedPositions, stackDrag.localPositions],
  );
  const hoverHighlights = useMemo(
    () => resolveHoverHighlights(players, cards, renderedPositions, selfPlayerId),
    [players, cards, renderedPositions, selfPlayerId],
  );
  const { magnifiedCardId, magnifyCard, clearMagnifiedCard } = useLocalUiState();
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  // The menu acts on live card state, so it closes itself if the card is
  // deleted or restacked by another player while it is open.
  const menuCard = cardMenu ? cards.find((card) => card.id === cardMenu.cardId) : undefined;
  const menuStack = cardMenu?.stackId
    ? stacks.find((stack) => stack.id === cardMenu.stackId)
    : undefined;
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const snapTarget = useMemo(() => {
    return drag.activeDrag
      ? findStackTarget(drag.activeDrag.cardId, drag.activeDrag.position, cards, stacks)
      : null;
  }, [cards, drag.activeDrag, stacks]);
  const resolvedSnapTarget = useMemo(
    () => resolveStackTarget(snapTarget, cards, stacks),
    [cards, snapTarget, stacks],
  );

  const magnified = useMemo(() => {
    const card = cards.find((candidate) => candidate.id === magnifiedCardId);
    const definition = card && definitionsById.get(card.definitionId);
    if (!card || !definition) return null;
    // Card positions anchor the centered Konva group (see Card's offset), so
    // they already represent the card center in world space.
    const worldPosition = renderedPositions.get(card.id) ?? { x: card.x, y: card.y };
    const center = worldToScreen(worldPosition, DEFAULT_VIEWPORT);
    return { definition, face: card.face, bounds: getPreviewBounds(center, size) };
  }, [cards, definitionsById, magnifiedCardId, renderedPositions, size]);

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
      onPointerMove={(event) => {
        // The preview is pointer-transparent, so leaving it is detected here
        // rather than by a mouseleave on the overlay itself.
        if (!magnified) return;
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        if (!isWithinPreview(point, magnified.bounds)) clearMagnifiedCard();
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
              {[...cards.filter((card) => card.stackId === undefined).map((card) => ({
                kind: "card" as const, zIndex: card.zIndex, card,
              })), ...stacks.map((stack) => ({
                kind: "stack" as const, zIndex: stack.zIndex, stack,
              }))]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((object) => {
                  if (object.kind === "stack") return (
                    <Stack key={object.stack.id} stack={object.stack}
                      position={stackDrag.localPositions[object.stack.id] ?? object.stack}
                      cards={cardsById}
                      definitionsById={definitionsById}
                      onDragStart={stackDrag.startDrag}
                      onDragMove={stackDrag.moveDrag}
                      onDragEnd={(stackId, position) => { void stackDrag.endDrag(stackId, position); }}
                      onTopFlip={(cardId) => { void multiplayer.flipCard(cardId); }}
                      onTopContextMenu={(cardId, stackId, position) => {
                        setCardMenu({ cardId, stackId, ...position });
                      }}
                      onTopHoverStart={hover.hoverStart}
                      onTopHoverEnd={hover.hoverEnd}
                    />
                  );
                  const card = object.card;
                  const definition: CardDefinition | undefined = definitionsById.get(
                    card.definitionId,
                  );
                  if (!definition) return null;
                  const position = renderedPositions.get(card.id) ?? { x: card.x, y: card.y };
                  return (
                    <Card
                      key={card.id}
                      definition={definition}
                      {...card}
                      {...position}
                      onDragStart={drag.startDrag}
                      onDragMove={drag.moveDrag}
                      onDragEnd={(cardId, nextPosition) => {
                        const target = findStackTarget(cardId, nextPosition, cards, stacks);
                        void drag.endDrag(cardId, nextPosition, target);
                      }}
                      onFlip={(cardId) => {
                        void multiplayer.flipCard(cardId).catch((cause: unknown) => {
                          console.warn("Card flip rejected:", cause);
                        });
                      }}
                      onContextMenu={(cardId, position) => {
                        setCardMenu({ cardId, ...position });
                      }}
                      onHoverStart={hover.hoverStart}
                      onHoverEnd={hover.hoverEnd}
                      onBringToFront={(cardId) => {
                        void multiplayer.bringToFront(cardId).catch((cause: unknown) => {
                          console.warn("Bring-to-front rejected:", cause);
                        });
                      }}
                    />
                  );
                })}
              {/* Drawn above the cards so an outline is never hidden by the
                  card stacked on top of the one it marks. */}
              {hoverHighlights.map((highlight) => (
                <HoverAttribution key={highlight.cardId} highlight={highlight} />
              ))}
              {resolvedSnapTarget && <SnapTargetOutline target={resolvedSnapTarget} />}
            </Group>
          </Layer>
        </Stage>
      )}
      {magnified && (
        <MagnifyPreview
          definition={magnified.definition}
          face={magnified.face}
          bounds={magnified.bounds}
        />
      )}
      {connectionError && <p className="tabletop-error">{connectionError}</p>}
      {cardMenu && menuCard && (
        <TableContextMenu
          menu={cardMenu}
          card={menuCard}
          stack={menuStack}
          commands={multiplayer}
          onMagnify={magnifyCard}
          onClose={() => setCardMenu(null)}
        />
      )}
    </div>
  );
}
