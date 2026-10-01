import { useEffect, type Ref } from "react";
import { Group, Layer, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { CardDefinition, CardInstance, CardStack } from "@card-table/shared";
import { PreloadedImagesContext } from "../../cards/CardRenderer";
import { Card } from "../Card";
import { Stack } from "../Stack";
import { TABLE_BACKGROUND_COLOR, tableObjectsInZOrder } from "../table-objects";
import type { WorldRect } from "./board-bounds";

export interface BoardSnapshotProps {
  cards: readonly CardInstance[];
  stacks: readonly CardStack[];
  definitionsById: ReadonlyMap<string, CardDefinition>;
  images: ReadonlyMap<string, HTMLImageElement>;
  bounds: WorldRect;
  scale: number;
  stageRef: Ref<Konva.Stage>;
  /** Called once the Konva tree has committed and can be captured. */
  onReady(): void;
}

function ReadySignal({ onReady }: { onReady(): void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

const noop = () => {};

/**
 * A static, non-interactive render of the whole table for image export.
 *
 * It reuses the table's own Card and Stack components so the image matches what
 * players see, but draws from authoritative state only: no hover outlines, snap
 * targets, menus, local drags, or this viewer's pan and zoom.
 */
export function BoardSnapshot({
  cards,
  stacks,
  definitionsById,
  images,
  bounds,
  scale,
  stageRef,
  onReady,
}: BoardSnapshotProps) {
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  return (
    <Stage ref={stageRef} width={width} height={height} listening={false}>
      <Layer>
        <PreloadedImagesContext.Provider value={images}>
          <Rect width={width} height={height} fill={TABLE_BACKGROUND_COLOR} />
          <Group x={-bounds.x * scale} y={-bounds.y * scale} scaleX={scale} scaleY={scale}>
            {tableObjectsInZOrder(cards, stacks).map((object) => {
              if (object.kind === "stack") {
                return (
                  <Stack
                    key={object.stack.id}
                    stack={object.stack}
                    position={object.stack}
                    cards={cardsById}
                    definitionsById={definitionsById}
                    onDragStart={noop}
                    onDragMove={noop}
                    onDragEnd={noop}
                    onTopFlip={noop}
                    onTopContextMenu={noop}
                    onTopHoverStart={noop}
                    onTopHoverEnd={noop}
                  />
                );
              }
              const definition = definitionsById.get(object.card.definitionId);
              return definition ? (
                <Card key={object.card.id} definition={definition} {...object.card} />
              ) : null;
            })}
          </Group>
          <ReadySignal onReady={onReady} />
        </PreloadedImagesContext.Provider>
      </Layer>
    </Stage>
  );
}
