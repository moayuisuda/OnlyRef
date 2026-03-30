import React from "react";
import { THEME } from "../../theme";

export interface SelectionBoxState {
  start: { x: number; y: number } | null;
  current: { x: number; y: number } | null;
}

interface SelectionRectProps {
  selectionBox: SelectionBoxState;
}

export const SelectionRect: React.FC<SelectionRectProps> = ({
  selectionBox,
}) => {
  if (!selectionBox.start || !selectionBox.current) return null;

  const x = Math.min(selectionBox.start.x, selectionBox.current.x);
  const y = Math.min(selectionBox.start.y, selectionBox.current.y);
  const width = Math.abs(selectionBox.current.x - selectionBox.start.x);
  const height = Math.abs(selectionBox.current.y - selectionBox.start.y);

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={THEME.canvas.selectionFill}
      stroke={THEME.primary}
      strokeWidth={1}
      pointerEvents="none"
    />
  );
};
