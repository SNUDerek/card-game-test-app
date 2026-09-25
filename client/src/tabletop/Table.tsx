import { Stage, Layer, Rect, Group } from "react-konva";
import { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import type { CardDefinition } from "@card-table/shared";
import { DEFAULT_VIEWPORT } from "./viewport";

// Mock definitions per Unit 5 specs (No server data yet)
const mockCardDef: CardDefinition = {
  id: "phoenix",
  name: "Phoenix",
  type: "Creature",
  body: "Deal 3 damage to any target. This card cannot be countered by normal means.",
  imageUrl: "/cards/phoenix.png",
  sourceName: "phoenix",
};

const mockCardDefLongText: CardDefinition = {
  id: "necromancer",
  name: "Necromancer",
  type: "Creature",
  body: "Flying, Trample. When this creature enters the battlefield, you may destroy target artifact or enchantment. If you do, draw a card. This creature gets +1/+1 for each other undead you control on the battlefield.",
  imageUrl: "/cards/necromancer.png",
  sourceName: "necromancer",
};

export function Table() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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
    <div ref={containerRef} className="tabletop-container">
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
              <Card
                definition={mockCardDef}
                x={200}
                y={240}
                face="front"
                orientation="upright"
              />

              <Card
                definition={mockCardDefLongText}
                x={500}
                y={240}
                face="front"
                orientation="tapped"
              />

              <Card
                definition={mockCardDef}
                x={800}
                y={240}
                face="back"
                orientation="upright"
              />
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  );
}
