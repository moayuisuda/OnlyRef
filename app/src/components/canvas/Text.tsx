import { type CanvasText as CanvasTextState, canvasActions, canvasState } from "../../store/canvasStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { THEME } from "../../theme";
import { CanvasControlButton } from "./CanvasButton";
import { CANVAS_ICONS } from "./CanvasIcons";
import { CanvasNode } from "./CanvasNode";

interface CanvasTextProps {
  item: CanvasTextState;
  isSelected: boolean;
  showControls: boolean;
  isPanModifierActive: boolean;
  stageScale: number;
  onDragStart: (pos: { x: number; y: number }) => void;
  onDragMove: (pos: { x: number; y: number }) => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onSelect: (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => void;
  onCommit: (next: Partial<CanvasTextState>) => void;
  onDelete: () => void;
  autoEdit?: boolean;
  onAutoEditComplete?: () => void;
   onCommitEnter?: () => void;
  onScaleStart: (client: { x: number; y: number }) => void;
  canvasOpacity: number;
}

export const CanvasText = ({
  item,
  isSelected,
  showControls,
  isPanModifierActive,
  stageScale,
  onDragStart,
  onDragMove,
  onDragEnd,
  onSelect,
  onCommit,
  onDelete,
  autoEdit,
  onAutoEditComplete,
  onCommitEnter,
  onScaleStart,
  canvasOpacity,
}: CanvasTextProps) => {
  const itemSnap = useSnapshot(item);
  const textRef = useRef<SVGTextElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [textRect, setTextRect] = useState<{ width: number; height: number }>({
    width: itemSnap.width || 0,
    height: itemSnap.height || 0,
  });

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const bbox = node.getBBox();
    const nextWidth = Math.max(0, bbox.width);
    const nextHeight = Math.max(0, bbox.height);
    setTextRect({
      width: nextWidth,
      height: nextHeight,
    });
    if (
      !isEditing &&
      (itemSnap.width !== nextWidth || itemSnap.height !== nextHeight)
    ) {
      canvasActions.updateCanvasImageSilent(itemSnap.canvasId, {
        width: nextWidth,
        height: nextHeight,
      });
    }
  }, [
    itemSnap.text,
    itemSnap.fontSize,
    itemSnap.align,
    itemSnap.width,
    itemSnap.height,
    itemSnap.canvasId,
    isEditing,
  ]);

  const startEditing = useCallback((initialSelection: "all" | "end") => {
    const textNode = textRef.current;
    if (!textNode) return false;
    if (isEditing) return false;

    setIsEditing(true);
    textNode.style.visibility = "hidden";

    const bbox = textNode.getBoundingClientRect();
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;
    const host = document.body;

    const input = document.createElement("input");
    input.type = "text";
    host.appendChild(input);

    input.value = itemSnap.text;
    input.style.position = "absolute";
    input.style.border = "none";
    input.style.padding = "0px";
    input.style.margin = "0px";
    input.style.overflow = "hidden";
    input.style.background = "none";
    input.style.outline = "none";
    input.style.lineHeight = "1.2";
    input.style.fontFamily = "inherit";
    input.style.textAlign = "center";
    input.style.zIndex = "50";

    const fill = itemSnap.fill;
    if (typeof fill === "string") {
      input.style.color = fill;
    }

    const visualScale = stageScale || 1;
    const screenFontSize = itemSnap.fontSize * visualScale;
    input.style.fontSize = `${screenFontSize}px`;

    const baseWidth = bbox.width * visualScale;
    const baseHeight = Math.max(screenFontSize * 1.2, bbox.height);
    let currentWidth = baseWidth;
    const currentHeight = baseHeight;

    const updatePosition = () => {
      const left = centerX - currentWidth / 2 + window.scrollX;
      const top = centerY - currentHeight / 2 + window.scrollY;
      input.style.left = `${left}px`;
      input.style.top = `${top}px`;
    };

    input.style.width = `${baseWidth}px`;
    input.style.height = `${baseHeight}px`;
    updatePosition();

    const syncSize = () => {
      input.style.width = "auto";

      const measuredWidth = input.scrollWidth || baseWidth;
      input.style.width = `${measuredWidth}px`;
      currentWidth = measuredWidth;
      updatePosition();

      onCommit({
        text: input.value,
      });
    };

    syncSize();
    setTimeout(() => {
      input.focus();
      if (initialSelection === "all") {
        input.setSelectionRange(0, input.value.length);
      } else {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 100);

    const removeInput = (commit: boolean) => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      window.removeEventListener("click", handleOutsideClick);
      setIsEditing(false);
      textNode.style.visibility = "visible";
      if (commit) {
        onCommit({
          text: input.value,
        });
      }
    };

    const handleOutsideClick = (e: MouseEvent) => {
      if (e.target !== input) {
        removeInput(true);
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        removeInput(true);
        onCommitEnter?.();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        removeInput(false);
      }
    });

    input.addEventListener("input", () => {
      syncSize();
    });

    setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
    });

    return true;
  }, [isEditing, itemSnap, onCommit, onCommitEnter, stageScale]);

  useEffect(() => {
    if (!autoEdit) return;
    if (isEditing) return;
    const timer = window.setTimeout(() => {
      const started = startEditing("all");
      if (started) {
        onAutoEditComplete?.();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoEdit, isEditing, startEditing, onAutoEditComplete]);

  const displayWidth = textRect.width || itemSnap.width || 0;
  const displayHeight = textRect.height || itemSnap.height || 0;

  const btnScale = 1 / stageScale;
  const deleteOffsetX = displayWidth / 2 + 4 * btnScale;
  const deleteOffsetY = -displayHeight / 2 - 4 * btnScale;
  const scaleOffsetX = displayWidth / 2 + 2;
  const scaleOffsetY = displayHeight / 2 + 2;

  const handleRotateStart = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const viewport = canvasState.canvasViewport;
    const centerX = itemSnap.x * viewport.scale + viewport.x;
    const centerY = itemSnap.y * viewport.scale + viewport.y;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - centerX;
      const dy = ev.clientY - centerY;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const rotation = angle + 90;
      canvasActions.updateCanvasImageSilent(itemSnap.canvasId, { rotation });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvasActions.commitCanvasChange();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleSelect = (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => {
    e.stopPropagation();
    if ("button" in e && e.button === 2) return;
    if (isPanModifierActive) return;
    onSelect(e);
    canvasActions.bringToFront(itemSnap.canvasId);
  };

  const handlePointerDown = (
    e: React.PointerEvent<SVGGElement> | React.MouseEvent<SVGGElement>,
  ) => {
    if (isPanModifierActive || isEditing) return;
    if (e.button !== 0) return;
    if ("pointerId" in e) {
      handleSelect(e);
    } else {
      // Fallback for non-pointer events if necessary, though onMouseDown is usually PointerEvent in React
      handleSelect(e as unknown as React.MouseEvent<SVGGElement>);
    }
    // Custom logic to prevent drag if editing, handled by isEditing check above
  };

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (isPanModifierActive || isEditing) return;
      const target = e.target as Element | null;
      if (target && target.closest("[data-control]")) return;
      startEditing("end");
    },
    [isPanModifierActive, isEditing, startEditing],
  );

  return (
    <CanvasNode
      id={itemSnap.canvasId}
      x={itemSnap.x}
      y={itemSnap.y}
      rotation={itemSnap.rotation}
      scaleX={1}
      scaleY={1}
      draggable={!isEditing}
      isSelected={isSelected}
      isPanModifierActive={isPanModifierActive}
      stageScale={stageScale}
      showControls={showControls}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onSelect={handleSelect}
      onMouseDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      controls={
        <>
          <CanvasControlButton
            x={0}
            y={-displayHeight / 2 - 40 * btnScale}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.ROTATE.PATH}
            iconScale={CANVAS_ICONS.ROTATE.SCALE}
            iconOffsetX={CANVAS_ICONS.ROTATE.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.ROTATE.OFFSET_Y}
            cursor="grab"
            onMouseDown={handleRotateStart}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onCommit({ rotation: 0 });
            }}
          />
          <CanvasControlButton
            x={deleteOffsetX}
            y={deleteOffsetY}
            scale={btnScale}
            size={24}
            fill={THEME.danger}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.TRASH.PATH}
            iconScale={CANVAS_ICONS.TRASH.SCALE}
            iconOffsetX={CANVAS_ICONS.TRASH.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.TRASH.OFFSET_Y}
            onClick={() => {
              onDelete();
            }}
          />
          <CanvasControlButton
            x={scaleOffsetX}
            y={scaleOffsetY}
            scale={btnScale}
            size={10}
            fill="white"
            stroke={THEME.primary}
            strokeWidth={2}
            cursor="nwse-resize"
            shadowBlur={4}
            onMouseDown={(e) => {
              onScaleStart({ x: e.clientX, y: e.clientY });
            }}
          />
        </>
      }
    >
      {isSelected && (
        <rect
          x={-displayWidth / 2 - 2}
          y={-displayHeight / 2 - 2}
          width={displayWidth + 4}
          height={displayHeight + 4}
          fill="none"
          stroke={THEME.primary}
          strokeWidth={1 / stageScale}
        />
      )}
      <text
        ref={textRef}
        x={0}
        y={0}
        fontSize={itemSnap.fontSize}
        fill={itemSnap.fill}
        opacity={canvasOpacity}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {itemSnap.text}
      </text>
    </CanvasNode>
  );
};
