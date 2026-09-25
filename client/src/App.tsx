import { Stage, Layer, Rect } from "react-konva";

export function App() {
  return (
    <Stage width={window.innerWidth} height={window.innerHeight}>
      <Layer>
        <Rect
          x={0}
          y={0}
          width={window.innerWidth}
          height={window.innerHeight}
          fill="#0b3d24"
        />
      </Layer>
    </Stage>
  );
}
