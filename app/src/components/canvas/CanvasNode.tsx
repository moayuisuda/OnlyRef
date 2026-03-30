import React, { useRef } from "react";

interface CanvasNodeProps {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  draggable: boolean;
  isSelected: boolean;
  isPanModifierActive?: boolean;
  stageScale?: number;
  showControls: boolean;
  onDragStart?: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onSelect?: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onTransform?: (matrix: DOMMatrix) => void;
  onTransformEnd?: (matrix: DOMMatrix) => void;
  onMouseDown?: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onClick?: (e: React.MouseEvent<SVGGElement>) => void;
  onTap?: (e: React.MouseEvent<SVGGElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<SVGGElement>) => void;
  children: React.ReactNode;
  controls?: React.ReactNode;

  transformerProps?: Record<string, unknown>;
}

export const CanvasNode: React.FC<CanvasNodeProps> = ({
  id,
  x,
  y,
  rotation,
  scaleX = 1,
  scaleY = 1,
  draggable,
  isPanModifierActive,
  stageScale = 1,
  showControls,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onMouseDown,
  onClick,
  onDoubleClick,
  children,
  controls,
}) => {
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originClientX: number;
    originClientY: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (isPanModifierActive) return;
    if (e.button !== 0) return; // Only left click

    if (onSelect) {
      onSelect(e);
    }
    
    // Custom onMouseDown handler if provided
    if (onMouseDown) {
      onMouseDown(e);
    }

    if (!draggable || !onDragStart || !onDragMove || !onDragEnd) return;

    dragStateRef.current = {
      startX: x,
      startY: y,
      originClientX: e.clientX,
      originClientY: e.clientY,
    };
    
    onDragStart({ x, y });

    const handleWindowPointerMove = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      
      const dx = (ev.clientX - state.originClientX) / stageScale;
      const dy = (ev.clientY - state.originClientY) / stageScale;
      const nextX = state.startX + dx;
      const nextY = state.startY + dy;
      onDragMove({ x: nextX, y: nextY });
    };

    const handleWindowPointerUp = (ev: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      
      const dx = (ev.clientX - state.originClientX) / stageScale;
      const dy = (ev.clientY - state.originClientY) / stageScale;
      const nextX = state.startX + dx;
      const nextY = state.startY + dy;
      
      onDragEnd({ x: nextX, y: nextY });

      dragStateRef.current = null;
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
  };

  return (
    <g
      id={id}
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scaleX} ${scaleY})`}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      className="select-none"
      onDoubleClick={onDoubleClick}
    >
      {children}
      {showControls && controls ? (
        <g
          transform={`translate(0 0)`}
          style={{ pointerEvents: "auto", cursor: "pointer" }}
        >
          {controls}
        </g>
      ) : null}
    </g>
  );
};
