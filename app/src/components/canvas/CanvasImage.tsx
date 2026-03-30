import React, { useEffect, useMemo } from "react";
import { useSnapshot } from "valtio";
import useImage from "use-image";
import { type CanvasImage as CanvasImageState } from "../../store/canvasStore";
import { getImageUrl } from "../../store/galleryStore";
import { canvasActions, canvasState } from "../../store/canvasStore";
import { globalState } from "../../store/globalStore";
import { THEME } from "../../theme";
import { CanvasControlButton } from "./CanvasButton";
import { CANVAS_ICONS } from "./CanvasIcons";
import { CanvasNode } from "./CanvasNode";

interface CanvasImageProps {
  image: CanvasImageState;
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
  onCommit: (next: Partial<CanvasImageState>) => void;
  onDelete: () => void;
  onScaleStart: (client: { x: number; y: number }) => void;
  globalGrayscale: boolean;
  globalFilters: readonly string[];
  canvasOpacity: number;
}

export const CanvasImage: React.FC<CanvasImageProps> = ({
  image,
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
  onScaleStart,
  globalGrayscale,
  globalFilters = [],
  canvasOpacity,
}) => {
  const imageSnap = useSnapshot(image);
  const globalSnap = useSnapshot(globalState);
  const [img] = useImage(getImageUrl(imageSnap.imagePath), "anonymous");

  const activeFilters = useMemo(() => {
    const filters = new Set<string>();

    if (globalGrayscale) filters.add("grayscale");
    if (imageSnap.grayscale) filters.add("grayscale");

    globalFilters.forEach((f) => filters.add(f));
    (imageSnap.filters || []).forEach((f) => filters.add(f));

    return Array.from(filters);
  }, [globalGrayscale, imageSnap.grayscale, globalFilters, imageSnap.filters]);

  const cssFilter = useMemo(() => {
    if (activeFilters.length === 0) return undefined;
    const parts: string[] = [];
    if (activeFilters.includes("grayscale")) {
      parts.push("grayscale(1)");
    }
    if (activeFilters.includes("trianglePixelate")) {
      parts.push("contrast(1.1) saturate(0.9)");
    }
    return parts.join(" ");
  }, [activeFilters]);

  useEffect(() => {
    if (
      img &&
      (imageSnap.width !== img.width || imageSnap.height !== img.height)
    ) {
      canvasActions.updateCanvasImageSilent(imageSnap.canvasId, {
        width: img.width,
        height: img.height,
      });
    }
  }, [img, imageSnap.width, imageSnap.height, imageSnap.canvasId]);

  useEffect(() => {
    if (
      typeof imageSnap.scaleX !== "number" &&
      typeof imageSnap.scaleY !== "number"
    )
      return;

    const legacyScaleX =
      typeof imageSnap.scaleX === "number" ? imageSnap.scaleX : undefined;
    const legacyScaleY =
      typeof imageSnap.scaleY === "number" ? imageSnap.scaleY : undefined;

    const hasLegacyMagnitude =
      (typeof legacyScaleX === "number" && Math.abs(legacyScaleX) !== 1) ||
      (typeof legacyScaleY === "number" && Math.abs(legacyScaleY) !== 1);

    if (!hasLegacyMagnitude) return;

    const magnitude =
      typeof legacyScaleX === "number"
        ? Math.abs(legacyScaleX)
        : typeof legacyScaleY === "number"
        ? Math.abs(legacyScaleY)
        : 1;

    const flipSign =
      typeof legacyScaleX === "number" ? (legacyScaleX < 0 ? -1 : 1) : 1;

    canvasActions.updateCanvasImageSilent(imageSnap.canvasId, {
      scale: magnitude,
      scaleX: flipSign,
      scaleY: 1,
    });
  }, [imageSnap.scaleX, imageSnap.scaleY, imageSnap.canvasId]);

  const handleFlip = () => {
    const sign = (imageSnap.scaleX ?? 1) < 0 ? -1 : 1;
    onCommit({ scaleX: sign * -1 });
  };

  const scale = imageSnap.scale || 1;
  const flipX = (imageSnap.scaleX ?? 1) < 0;

  const btnScale = 1 / (scale * stageScale);

  const handleSelect = (
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => {
    e.stopPropagation();
    if ("button" in e && e.button === 2) return;
    if (isPanModifierActive) return;
    onSelect(e);
    canvasActions.bringToFront(imageSnap.canvasId);
  };

  const baseWidth = imageSnap.width || (img?.width ?? 0) || 0;
  const baseHeight = imageSnap.height || (img?.height ?? 0) || 0;

  const sx = scale;
  const sy = scale * (imageSnap.scaleY ?? 1);

  const safeScale = Math.max(0.05, scale);
  const renderOpacity = canvasOpacity;

  const handleRotateStart = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const viewport = canvasState.canvasViewport;
    const centerX = imageSnap.x * viewport.scale + viewport.x;
    const centerY = imageSnap.y * viewport.scale + viewport.y;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - centerX;
      const dy = ev.clientY - centerY;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const rotation = angle + 90;
      canvasActions.updateCanvasImageSilent(imageSnap.canvasId, { rotation });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvasActions.commitCanvasChange();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <CanvasNode
      id={imageSnap.canvasId}
      x={imageSnap.x}
      y={imageSnap.y}
      rotation={imageSnap.rotation}
      scaleX={sx}
      scaleY={sy}
      draggable={true}
      isSelected={isSelected}
      isPanModifierActive={isPanModifierActive}
      stageScale={stageScale}
      showControls={showControls}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onSelect={handleSelect}
      controls={
        <>
          <CanvasControlButton
            x={0}
            y={-baseHeight / 2 - 40 * btnScale}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.ROTATE.PATH}
            iconScale={CANVAS_ICONS.ROTATE.SCALE}
            iconOffsetX={CANVAS_ICONS.ROTATE.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.ROTATE.OFFSET_Y}
            onMouseDown={handleRotateStart}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onCommit({ rotation: 0 });
            }}
          />
          <CanvasControlButton
            x={-baseWidth / 2}
            y={-baseHeight / 2}
            scale={btnScale}
            size={24}
            fill={THEME.primary}
            stroke="white"
            strokeWidth={2}
            iconPath={CANVAS_ICONS.FLIP.PATH}
            iconScale={CANVAS_ICONS.FLIP.SCALE}
            iconOffsetX={CANVAS_ICONS.FLIP.OFFSET_X}
            iconOffsetY={CANVAS_ICONS.FLIP.OFFSET_Y}
            onClick={() => {
              handleFlip();
            }}
          />
          <CanvasControlButton
            x={baseWidth / 2}
            y={-baseHeight / 2}
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
            x={baseWidth / 2}
            y={baseHeight / 2}
            scale={btnScale}
            size={10}
            className="cursor-nwse-resize"
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
      {isSelected && !globalSnap.mouseThrough && (
        <rect
          x={-baseWidth / 2}
          y={-baseHeight / 2}
          width={baseWidth}
          height={baseHeight}
          fill="none"
          stroke={THEME.primary}
          strokeWidth={3 / (stageScale * safeScale)}
        />
      )}
      <image
        href={img ? img.src : undefined}
        x={-baseWidth / 2}
        y={-baseHeight / 2}
        width={baseWidth}
        height={baseHeight}
        style={{
          filter: cssFilter,
          opacity: renderOpacity,
        }}
        transform={flipX ? "scale(-1 1)" : undefined}
      />
    </CanvasNode>
  );
};
