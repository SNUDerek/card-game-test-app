import { Stage, Layer, Rect } from "react-konva";
import { useState, useEffect } from "react";
import { Card } from "./Card";
import type { CardDefinition } from "@card-table/shared";

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
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <Stage width={windowSize.width} height={windowSize.height}>
      <Layer>
        {/* Play Surface */}
        <Rect
          x={0}
          y={0}
          width={windowSize.width}
          height={windowSize.height}
          fill="#0b3d24"
        />

        {/* World Space Container (Prepared for future pan/zoom) */}
        <Card
          definition={mockCardDef}
          x={100}
          y={100}
          face="front"
          orientation="upright"
        />

        {/* Tapped cards rotate around their center, so their visual
            bounding box is wider than it is tall — positioned with
            enough clearance to avoid overlapping the neighboring cards. */}
        <Card
          definition={mockCardDefLongText}
          x={500}
          y={240}
          face="front"
          orientation="tapped"
        />

        <Card
          definition={mockCardDef}
          x={750}
          y={100}
          face="back"
          orientation="upright"
        />
      </Layer>
    </Stage>
  );
}
