import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { debounce } from "radash";
import {
  actions as galleryActions,
  type ImageMeta,
} from "../store/galleryStore";
import {
  canvasState,
  canvasActions,
  getRenderBbox,
  type CanvasImage as CanvasImageState,
} from "../store/canvasStore";
import { anchorActions } from "../store/anchorStore";
import { globalActions, globalState } from "../store/globalStore";
import { useSnapshot } from "valtio";
import {
  getTempDominantColor,
  type CanvasViewport,
} from "../service";
import { API_BASE_URL } from "../config";
import { ConfirmModal } from "./ConfirmModal";
import { Minimap } from "./canvas/Minimap";
import { CanvasText } from "./canvas/Text";
import { CanvasImage } from "./canvas/CanvasImage";
import { CanvasToolbar } from "./canvas/CanvasToolbar";
import { MultiSelectOverlay } from "./canvas/MultiSelectOverlay";
import { SelectionRect, type SelectionBoxState } from "./canvas/SelectionRect";
import { useT } from "../i18n/useT";
import { createTempMetasFromFiles } from "../utils/import";
import { THEME } from "../theme";
import { CANVAS_AUTO_LAYOUT } from "../events/uiEvents";

export const Canvas: React.FC = () => {
  const appSnap = useSnapshot(globalState);
  const canvasSnap = useSnapshot(canvasState);
  const {
    selectedIds,
    primaryId,
    autoEditId,
    isClearModalOpen,
    dimensions,
    isSpaceDown,
    canvasViewport,
    multiSelectUnion,
    selectionBox,
    canvasItems,
    canvasFilters,
    showMinimap,
    isCanvasToolbarExpanded,
    canvasGrayscale,
  } = canvasSnap;

  const { t } = useT();
  const shouldEnableMouseThrough = appSnap.pinMode && appSnap.mouseThrough;

  const selectedIdsRef = useRef<Set<string>>(new Set());
  const zoomStackRef = useRef<CanvasViewport[]>([]);
  const preZoomViewportRef = useRef<CanvasViewport | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stageScale = canvasViewport.scale || 1;

  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const debouncedCommit = useMemo(
    () =>
      debounce({ delay: 500 }, () => {
        canvasActions.commitCanvasChange();
      }),
    [],
  );
  const selectionAppendRef = useRef(false);
  const selectionModeRef = useRef<"select" | "zoom">("select");
  const multiDragRef = useRef<{
    active: boolean;
    draggedId: string | null;
    anchor: { x: number; y: number } | null;
    snapshots: Map<string, { x: number; y: number }>;
  }>({ active: false, draggedId: null, anchor: null, snapshots: new Map() });
  const multiScaleRef = useRef<{
    active: boolean;
    anchor: { x: number; y: number } | null;
    startUnion: { x: number; y: number; width: number; height: number } | null;
    startDistance: number;
    scale: number;
    snapshots: Map<
      string,
      {
        type: "image" | "text";
        x: number;
        y: number;
        scale: number;
        scaleX?: number;
        scaleY?: number;
        fontSize?: number;
      }
    >;
  }>({
    active: false,
    anchor: null,
    startUnion: null,
    startDistance: 1,
    scale: 1,
    snapshots: new Map(),
  });

  const setSelectedIds = (ids: Set<string>) => {
    canvasState.selectedIds = ids;
  };

  const setPrimaryId = (id: string | null) => {
    canvasState.primaryId = id;
  };

  const setMultiSelectUnion = (rect: typeof canvasState.multiSelectUnion) => {
    canvasState.multiSelectUnion = rect;
  };

  const setSelectionBox = (box: SelectionBoxState) => {
    canvasState.selectionBox = box;
  };

  const setAutoEditId = (id: string | null) => {
    canvasState.autoEditId = id;
  };

  const setIsClearModalOpen = (open: boolean) => {
    canvasState.isClearModalOpen = open;
  };

  const setIsSpaceDown = (value: boolean) => {
    canvasState.isSpaceDown = value;
  };

  useEffect(() => {
    canvasActions.initCanvas();
  }, []);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const computeMultiSelectUnion = (ids: Set<string>) => {
    if (ids.size <= 1) return null;

    const items = canvasState.canvasItems || [];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    items.forEach((item) => {
      if (!ids.has(item.canvasId)) return;

      const scale = item.scale || 1;
      const rawW =
        (item.width || 0) *
        scale *
        Math.abs(item.type === "text" ? 1 : item.scaleX || 1);
      const rawH =
        (item.height || 0) *
        scale *
        Math.abs(item.type === "text" ? 1 : item.scaleY || 1);
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

      const itemMinX = item.x + bbox.offsetX;
      const itemMinY = item.y + bbox.offsetY;
      const itemMaxX = itemMinX + bbox.width;
      const itemMaxY = itemMinY + bbox.height;

      minX = Math.min(minX, itemMinX);
      minY = Math.min(minY, itemMinY);
      maxX = Math.max(maxX, itemMaxX);
      maxY = Math.max(maxY, itemMaxY);
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const getLocalPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    [],
  );

  const localToWorldPoint = useCallback(
    (point: { x: number; y: number }) => {
      const scale = stageScale || 1;
      return {
        x: (point.x - canvasViewport.x) / scale,
        y: (point.y - canvasViewport.y) / scale,
      };
    },
    [canvasViewport.x, canvasViewport.y, stageScale],
  );

  const getWorldPointFromClient = useCallback(
    (client: { x: number; y: number }) => {
      const local = getLocalPointFromClient(client.x, client.y);
      if (!local) return null;
      return localToWorldPoint(local);
    },
    [getLocalPointFromClient, localToWorldPoint],
  );

  const handleCanvasMouseEnter = () => {
    if (shouldEnableMouseThrough) {
      // window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        canvasState.dimensions = {
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        };
      }
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    canvasState.dimensions = {
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    };
  }, [appSnap.pinMode, appSnap.sidebarWidth]);

  useEffect(() => {
    const handleDropRequest = (e: Event) => {
      const customEvent = e as CustomEvent<{
        image: ImageMeta;
        x: number;
        y: number;
      }>;
      const { image, x, y } = customEvent.detail;

      const local = getLocalPointFromClient(x, y);
      if (!local) return;
      const basePoint = localToWorldPoint(local);

      canvasActions.addToCanvas(image, basePoint.x, basePoint.y);
    };

    window.addEventListener("canvas-drop-request", handleDropRequest);
    return () =>
      window.removeEventListener("canvas-drop-request", handleDropRequest);
  }, [getLocalPointFromClient, localToWorldPoint]);

  const clearSelection = useCallback(() => {
    canvasState.selectedIds = new Set();
    canvasState.primaryId = null;
    canvasState.multiSelectUnion = null;
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    console.log("[Canvas] handleDrop triggered", {
      files: e.dataTransfer.files.length,
      types: e.dataTransfer.types,
      items: e.dataTransfer.items.length,
    });
    const localPoint = getLocalPointFromClient(e.clientX, e.clientY);
    if (!localPoint) {
      console.log("[Canvas] handleDrop: no container");
      return;
    }

    try {
      const basePoint = localToWorldPoint(localPoint);

      const data = e.dataTransfer.getData("application/json");
      if (data) {
        try {
          const image = JSON.parse(data) as ImageMeta;
          if (image && image.id && image.imagePath) {
            canvasActions.addToCanvas(image, basePoint.x, basePoint.y);
            return;
          }
        } catch {
          // ignore
        }
      }

      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) {
        // Try to extract image URL from HTML first (handles Twitter/X etc.)
        const html = e.dataTransfer.getData("text/html");
        let url = "";
        if (html) {
          const img = new DOMParser()
            .parseFromString(html, "text/html")
            .querySelector("img");
          if (img?.src) {
            url = img.src;
            console.log("[Canvas] extracted img src from html:", url);
          }
        }
        // Fallback to uri-list or plain text
        if (!url) {
          const urlData =
            e.dataTransfer.getData("text/uri-list") ||
            e.dataTransfer.getData("text/plain");
          if (urlData) {
            url = urlData.split("\n")[0].trim();
          }
        }
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          try {
            const resp = await fetch(`${API_BASE_URL}/api/download-url`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            if (resp.ok) {
              const result = (await resp.json()) as {
                success?: boolean;
                filename?: string;
                path?: string;
              };
              if (result.success && result.filename && result.path) {
                const dominantColor = await getTempDominantColor(result.path);
                const meta = galleryActions.createDroppedImageMeta({
                  path: result.path,
                  storedFilename: `temp-images/${result.filename}`,
                  originalName: result.filename,
                  dominantColor,
                });
                canvasActions.addToCanvas(meta, basePoint.x, basePoint.y);
              }
            }
          } catch (err) {
            console.error("URL drop error", err);
          }
        }
        return;
      }

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (!imageFiles.length) return;

      const metas = await createTempMetasFromFiles(imageFiles);
      metas.forEach((meta, index) => {
        const offset = index * 24;
        canvasActions.addToCanvas(
          meta,
          basePoint.x + offset,
          basePoint.y + offset,
        );
      });
    } catch (err: unknown) {
      console.error("Drop error", err);
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    if (selectedIds.size > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let hasValidSelection = false;
      const validItems: {
        item: (typeof items)[0];
      }[] = [];

      const items = canvasItems || [];
      items.forEach((item) => {
        if (selectedIds.has(item.canvasId)) {
          const scale = item.scale || 1;
          const rawW = (item.width || 0) * scale * Math.abs(item.scaleX || 1);
          const rawH =
            (item.height || 0) *
            scale *
            Math.abs(item.type === "text" ? 1 : item.scaleY || 1);
          const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

          const itemMinX = item.x + bbox.offsetX;
          const itemMinY = item.y + bbox.offsetY;
          const itemMaxX = itemMinX + bbox.width;
          const itemMaxY = itemMinY + bbox.height;

          if (itemMinX < minX) minX = itemMinX;
          if (itemMinY < minY) minY = itemMinY;
          if (itemMaxX > maxX) maxX = itemMaxX;
          if (itemMaxY > maxY) maxY = itemMaxY;

          hasValidSelection = true;
          validItems.push({ item });
        }
      });

      if (hasValidSelection && minX !== Infinity) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const scaleBy = 1.05;
        const factor = e.deltaY > 0 ? 1 / scaleBy : scaleBy;

        validItems.forEach(({ item }) => {
          const dx = item.x - centerX;
          const dy = item.y - centerY;

          const newX = centerX + dx * factor;
          const newY = centerY + dy * factor;

          if (item.type === "text") {
            const fontSize = item.fontSize || 24;
            canvasActions.updateCanvasImageSilent(item.canvasId, {
              x: newX,
              y: newY,
              fontSize: fontSize * factor,
            });
          } else {
            const scale = item.scale || 1;
            canvasActions.updateCanvasImageSilent(item.canvasId, {
              x: newX,
              y: newY,
              scale: scale * factor,
            });
          }
        });

        // Try to update selection box immediately for better visual feedback
        setTimeout(() => {
          setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
        }, 0);

        debouncedCommit();
      }
      return;
    }

    const scaleBy = 1.05;
    const oldScale = canvasViewport.scale;
    const rect = svg.getBoundingClientRect();
    const pointer = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const mousePointTo = {
      x: (pointer.x - canvasViewport.x) / oldScale,
      y: (pointer.y - canvasViewport.y) / oldScale,
    };

    const newScale = e.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    canvasActions.setCanvasViewport({
      x: newPos.x,
      y: newPos.y,
      width: rect.width,
      height: rect.height,
      scale: newScale,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsSpaceDown(true);
        const svg = svgRef.current;
        if (svg) svg.style.cursor = "grab";
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
        isPanningRef.current = false;
        lastPanPointRef.current = null;
        const svg = svgRef.current;
        if (svg) svg.style.cursor = "default";
      }
    };
    const handleBlur = () => {
      setIsSpaceDown(false);
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "default";
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    const cleanup = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event === "restore-anchor") {
          const slot = args[0] as string;
          if (slot) {
            anchorActions.restoreAnchor(slot);
          }
        } else if (event === "save-anchor") {
          const slot = args[0] as string;
          if (slot) {
            anchorActions.saveAnchor(slot);
            globalActions.pushToast({ key: "canvas.anchor.saved" }, "success");
          }
        }
      },
    );
    return cleanup;
  }, []);

  const zoomToBounds = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      padding = 50,
    ) => {
      const { width, height, x: minX, y: minY } = bounds;

      if (!Number.isFinite(width) || !Number.isFinite(height)) return;

      const containerWidth = canvasState.dimensions.width;
      const containerHeight = canvasState.dimensions.height;

      const scaleX = (containerWidth - padding * 2) / width;
      const scaleY = (containerHeight - padding * 2) / height;
      const scale = Math.min(scaleX, scaleY);

      const x = (containerWidth - width * scale) / 2 - minX * scale;
      const y = (containerHeight - height * scale) / 2 - minY * scale;

      canvasActions.setCanvasViewport({
        x,
        y,
        width: containerWidth,
        height: containerHeight,
        scale,
      });
    },
    [],
  );

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const isMiddleButton = e.button === 1;
    if (isSpaceDown || isMiddleButton) {
      e.preventDefault();
      isPanningRef.current = true;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "grabbing";
      return;
    }

    const isRightButton = e.button === 2;
    if (isRightButton) {
      e.preventDefault();
      const local = getLocalPointFromClient(e.clientX, e.clientY);
      if (!local) return;

      // Save current viewport before zoom operation
      preZoomViewportRef.current = { ...canvasViewport };

      const pos = localToWorldPoint(local);
      selectionModeRef.current = "zoom";
      setSelectionBox({ start: pos, current: pos });
      return;
    }

    const isLeftButton = e.button === 0;
    if (isLeftButton && e.target === e.currentTarget) {
      const local = getLocalPointFromClient(e.clientX, e.clientY);
      if (!local) return;
      const pos = localToWorldPoint(local);
      selectionAppendRef.current = !!(
        e.shiftKey || e.metaKey || e.ctrlKey
      );
      selectionModeRef.current = "select";
      setSelectionBox({ start: pos, current: pos });
      if (!selectionAppendRef.current) {
        setSelectedIds(new Set());
        setPrimaryId(null);
        setMultiSelectUnion(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (multiScaleRef.current.active) {
      const current = multiScaleRef.current;
      if (!current.anchor || !current.startUnion) return;
      const local = getLocalPointFromClient(e.clientX, e.clientY);
      if (!local) return;
      const pos = localToWorldPoint(local);
      const base = Math.max(1, current.startDistance || 1);
      const next = Math.hypot(
        pos.x - current.anchor.x,
        pos.y - current.anchor.y,
      );
      const scale = Math.max(0.1, next / base);
      current.scale = scale;
      current.snapshots.forEach((start, selectedId) => {
        const nextX = current.anchor!.x + (start.x - current.anchor!.x) * scale;
        const nextY = current.anchor!.y + (start.y - current.anchor!.y) * scale;
        if (start.type === "text") {
          const nextFontSize = Math.max(8, (start.fontSize || 0) * scale);
          canvasActions.updateCanvasImageTransient(selectedId, {
            x: nextX,
            y: nextY,
            fontSize: nextFontSize,
          });
        } else {
          const nextScale = Math.max(0.05, start.scale * scale);
          canvasActions.updateCanvasImageTransient(selectedId, {
            x: nextX,
            y: nextY,
            scale: nextScale,
          });
        }
      });
      setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      return;
    }
    // Panning (Space held)
    if (isPanningRef.current) {
      const last = lastPanPointRef.current;
      if (!last) return;

      const currentPoint = { x: e.clientX, y: e.clientY };

      const dx = currentPoint.x - last.x;
      const dy = currentPoint.y - last.y;
      // We need to calculate based on the current viewport state in store
      // because stage.x() might not be updated yet in React render cycle
      // However, for smooth dragging, we usually rely on event deltas.
      // Since we are now controlled, we should base on canvasViewport.

      const nextPos = { x: canvasViewport.x + dx, y: canvasViewport.y + dy };

      canvasActions.setCanvasViewport({
        x: nextPos.x,
        y: nextPos.y,
        width: canvasState.dimensions.width,
        height: canvasState.dimensions.height,
        scale: canvasViewport.scale,
      });
      lastPanPointRef.current = currentPoint;
      return;
    }

    // Box Selection
    if (selectionBox.start) {
      const local = getLocalPointFromClient(e.clientX, e.clientY);
      if (!local) return;
      const pos = localToWorldPoint(local);
      canvasState.selectionBox = {
        ...canvasState.selectionBox,
        current: pos,
      };
    }
  };

  const handleMouseUp = () => {
    if (multiScaleRef.current.active) {
      const current = multiScaleRef.current;
      const scale = current.scale || 1;
      if (current.anchor) {
        current.snapshots.forEach((start, selectedId) => {
          const nextX =
            current.anchor!.x + (start.x - current.anchor!.x) * scale;
          const nextY =
            current.anchor!.y + (start.y - current.anchor!.y) * scale;
          if (start.type === "text") {
            const nextFontSize = Math.max(8, (start.fontSize || 0) * scale);
            canvasActions.updateCanvasImage(selectedId, {
              x: nextX,
              y: nextY,
              fontSize: nextFontSize,
            });
          } else {
            const nextScale = Math.max(0.05, start.scale * scale);
            canvasActions.updateCanvasImage(selectedId, {
              x: nextX,
              y: nextY,
              scale: nextScale,
            });
          }
        });
      }
      multiScaleRef.current = {
        active: false,
        anchor: null,
        startUnion: null,
        startDistance: 1,
        scale: 1,
        snapshots: new Map(),
      };
      setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      const svg = svgRef.current;
      if (svg) svg.style.cursor = "default";
      return;
    }
    const svg = svgRef.current;
    if (svg) svg.style.cursor = "default";

    isPanningRef.current = false;
    lastPanPointRef.current = null;

    if (selectionBox.start && selectionBox.current) {
      const x1 = Math.min(selectionBox.start.x, selectionBox.current.x);
      const x2 = Math.max(selectionBox.start.x, selectionBox.current.x);
      const y1 = Math.min(selectionBox.start.y, selectionBox.current.y);
      const y2 = Math.max(selectionBox.start.y, selectionBox.current.y);
      const width = x2 - x1;
      const height = y2 - y1;

      const isClick = width <= 2 && height <= 2;

      if (selectionModeRef.current === "zoom") {
        if (isClick) {
          const prev = zoomStackRef.current.pop();
          if (prev) {
            canvasActions.setCanvasViewport(prev);
          }
        } else {
          if (preZoomViewportRef.current) {
            zoomStackRef.current.push(preZoomViewportRef.current);
          }
          zoomToBounds({ x: x1, y: y1, width, height }, 0);
        }
        canvasState.selectionBox = { start: null, current: null };
        return;
      }

      if (!isClick) {
        const newSelected = selectionAppendRef.current
          ? new Set(selectedIds)
          : new Set<string>();
        let lastHitId: string | null = null;
        (canvasItems || []).forEach((item) => {
          const scale = item.scale || 1;
          const rawW =
            (item.width || 0) *
            scale *
            Math.abs(item.type === "text" ? 1 : item.scaleX || 1);
          const rawH =
            (item.height || 0) *
            scale *
            Math.abs(item.type === "text" ? 1 : item.scaleY || 1);
          const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

          const itemMinX = item.x + bbox.offsetX;
          const itemMinY = item.y + bbox.offsetY;
          const itemMaxX = itemMinX + bbox.width;
          const itemMaxY = itemMinY + bbox.height;

          if (
            itemMinX < x2 &&
            itemMaxX > x1 &&
            itemMinY < y2 &&
            itemMaxY > y1
          ) {
            newSelected.add(item.canvasId);
            lastHitId = item.canvasId;
          }
        });
        setSelectedIds(newSelected);
        if (lastHitId) setPrimaryId(lastHitId);
        setMultiSelectUnion(computeMultiSelectUnion(newSelected));
      }
    }
    canvasState.selectionBox = { start: null, current: null };
  };

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (multiScaleRef.current.active) {
        const current = multiScaleRef.current;
        const scale = current.scale || 1;
        if (current.anchor) {
          current.snapshots.forEach((start, selectedId) => {
            const nextX =
              current.anchor!.x + (start.x - current.anchor!.x) * scale;
            const nextY =
              current.anchor!.y + (start.y - current.anchor!.y) * scale;
            if (start.type === "text") {
              const nextFontSize = Math.max(8, (start.fontSize || 0) * scale);
              canvasActions.updateCanvasImage(selectedId, {
                x: nextX,
                y: nextY,
                fontSize: nextFontSize,
              });
            } else {
              const nextScale = Math.max(0.05, start.scale * scale);
              canvasActions.updateCanvasImage(selectedId, {
                x: nextX,
                y: nextY,
                scale: nextScale,
              });
            }
          });
        }
        multiScaleRef.current = {
          active: false,
          anchor: null,
          startUnion: null,
          startDistance: 1,
          scale: 1,
          snapshots: new Map(),
        };
        setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      }
      if (canvasState.selectionBox.start || canvasState.selectionBox.current) {
        canvasState.selectionBox = { start: null, current: null };
      }
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      const svg = svgRef.current;
      if (svg) {
        svg.style.cursor = "default";
      }
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchend", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchend", handleWindowMouseUp);
    };
  }, []);

  const getItemsBoundingBox = useCallback((items: typeof canvasItems) => {
    if (!items || items.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    items.forEach((item) => {
      const scale = item.scale || 1;
      const rawW = (item.width || 0) * scale * Math.abs(item.scaleX || 1);
      const rawH =
        (item.height || 0) *
        scale *
        Math.abs(item.type === "text" ? 1 : item.scaleY || 1);
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);

      minX = Math.min(minX, item.x + bbox.offsetX);
      minY = Math.min(minY, item.y + bbox.offsetY);
      maxX = Math.max(maxX, item.x + bbox.offsetX + bbox.width);
      maxY = Math.max(maxY, item.y + bbox.offsetY + bbox.height);
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, []);

  const handleAutoLayout = useCallback(() => {
    if (selectedIds.size > 0) {
      const items = canvasItems || [];
      const selectedItems = items.filter((item) =>
        selectedIds.has(item.canvasId),
      );
      const selectedImages = selectedItems.filter(
        (item) => item.type === "image",
      );

      if (selectedImages.length >= 2) {
        const bbox = getItemsBoundingBox(selectedImages);
        const minX = bbox?.x ?? 0;
        const minY = bbox?.y ?? 0;

        canvasActions.autoLayoutCanvas(
          selectedImages.map((item) => item.canvasId),
          {
            startX: minX,
            startY: minY,
          },
        );

        setTimeout(() => {
          setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
        }, 0);
        return;
      }
    }

    canvasActions.autoLayoutCanvas();
    const items = canvasState.canvasItems || [];
    const bbox = getItemsBoundingBox(items);
    if (!bbox) return;

    zoomToBounds(bbox, 50);
  }, [canvasItems, selectedIds, zoomToBounds, getItemsBoundingBox]);

  useEffect(() => {
    const handleLayoutEvent = () => handleAutoLayout();
    window.addEventListener(CANVAS_AUTO_LAYOUT, handleLayoutEvent);
    return () => {
      window.removeEventListener(CANVAS_AUTO_LAYOUT, handleLayoutEvent);
    };
  }, [handleAutoLayout]);

  const handleFlipSelection = useCallback(() => {
    if (selectedIds.size === 0) return;

    selectedIds.forEach((id) => {
      const item = canvasItems.find((i) => i.canvasId === id);
      if (item && item.type !== "text") {
        const currentScaleX = item.scaleX || 1;
        canvasActions.updateCanvasImage(id, {
          scaleX: currentScaleX * -1,
        });
      }
    });
    setTimeout(() => {
      setMultiSelectUnion(computeMultiSelectUnion(selectedIds));
    }, 0);
  }, [selectedIds, canvasItems]);

  useHotkeys(
    "mod+f",
    (e) => {
      e.preventDefault();
      handleFlipSelection();
    },
    { preventDefault: true },
    [handleFlipSelection],
  );

  const handleDeleteSelection = () => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    canvasActions.removeManyFromCanvas(ids);
    clearSelection();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        canvasActions.undoCanvas();
        setSelectedIds(new Set());
        setPrimaryId(null);
        setMultiSelectUnion(null);
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        canvasActions.redoCanvas();
        setSelectedIds(new Set());
        setPrimaryId(null);
        setMultiSelectUnion(null);
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIds.size > 0
      ) {
        canvasActions.removeManyFromCanvas(Array.from(selectedIds));
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, clearSelection]);

  const handleDragStart = (id: string, pos: { x: number; y: number }) => {
    const currentSelected = selectedIdsRef.current;
    if (!currentSelected.has(id)) {
      multiDragRef.current = {
        active: false,
        draggedId: null,
        anchor: null,
        snapshots: new Map(),
      };
      return;
    }
    if (currentSelected.size <= 1) {
      multiDragRef.current = {
        active: false,
        draggedId: null,
        anchor: null,
        snapshots: new Map(),
      };
      return;
    }
    const snapshots = new Map<string, { x: number; y: number }>();
    currentSelected.forEach((selectedId) => {
      const target = canvasItems.find((it) => it.canvasId === selectedId);
      if (target) snapshots.set(selectedId, { x: target.x, y: target.y });
    });
    multiDragRef.current = {
      active: true,
      draggedId: id,
      anchor: pos,
      snapshots,
    };
  };

  const startScaleSession = (
    targetIds: Set<string>,
    union: { x: number; y: number; width: number; height: number },
    startPoint?: { x: number; y: number } | null,
  ) => {
    if (targetIds.size === 0) return;
    if (union.width <= 0 || union.height <= 0) return;
    const snapshots = new Map<
      string,
      {
        type: "image" | "text";
        x: number;
        y: number;
        scale: number;
        scaleX?: number;
        scaleY?: number;
        fontSize?: number;
      }
    >();
    targetIds.forEach((selectedId) => {
      const target = canvasItems.find((it) => it.canvasId === selectedId);
      if (!target) return;
      if (target.type === "text") {
        snapshots.set(selectedId, {
          type: "text",
          x: target.x,
          y: target.y,
          scale: target.scale || 1,
          fontSize: target.fontSize || 24,
        });
        return;
      }
      const img = target as CanvasImageState;
      snapshots.set(selectedId, {
        type: "image",
        x: img.x,
        y: img.y,
        scale: img.scale || 1,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
      });
    });
    if (snapshots.size === 0) return;
    const anchor = { x: union.x, y: union.y };
    const startDistance = Math.max(
      1,
      startPoint
        ? Math.hypot(startPoint.x - anchor.x, startPoint.y - anchor.y)
        : Math.hypot(union.width, union.height),
    );
    multiScaleRef.current = {
      active: true,
      anchor,
      startUnion: { ...union },
      startDistance,
      scale: 1,
      snapshots,
    };
    const svg = svgRef.current;
    if (svg) svg.style.cursor = "nwse-resize";
  };

  const handleGroupScaleStart = (client: { x: number; y: number }) => {
    const union = multiSelectUnion;
    const currentSelected = selectedIdsRef.current;
    if (!union) return;
    if (currentSelected.size <= 1) return;
    const startPoint = getWorldPointFromClient(client);
    startScaleSession(currentSelected, union, startPoint);
  };

  const handleItemScaleStart = (id: string, client: { x: number; y: number }) => {
    const target = canvasItems.find((it) => it.canvasId === id);
    if (!target) return;
    const scale = target.scale || 1;
    const width = target.width || 0;
    const height = target.height || 0;
    const rotation = target.rotation || 0;

    const rawW =
      width *
      scale *
      Math.abs(target.type === "text" ? 1 : (target as CanvasImageState).scaleX || 1);
    const rawH =
      height *
      scale *
      Math.abs(target.type === "text" ? 1 : (target as CanvasImageState).scaleY || 1);

    if (rawW <= 0 || rawH <= 0) return;

    const bbox = getRenderBbox(rawW, rawH, rotation);
    
    const union = {
      x: target.x + bbox.offsetX,
      y: target.y + bbox.offsetY,
      width: bbox.width,
      height: bbox.height,
    };
    const startPoint = getWorldPointFromClient(client);
    startScaleSession(new Set([id]), union, startPoint);
  };

  const handleDragMove = (id: string, pos: { x: number; y: number }) => {
    const multi = multiDragRef.current;
    if (multi.active && multi.anchor) {
      const dx = pos.x - multi.anchor.x;
      const dy = pos.y - multi.anchor.y;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImageTransient(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
      setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
      return;
    }
    canvasActions.updateCanvasImageTransient(id, {
      x: pos.x,
      y: pos.y,
    });
    setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
  };

  const handleDragEnd = (id: string, pos: { x: number; y: number }) => {
    const multi = multiDragRef.current;
    if (multi.active && multi.anchor) {
      const dx = pos.x - multi.anchor.x;
      const dy = pos.y - multi.anchor.y;
      multi.snapshots.forEach((start, selectedId) => {
        canvasActions.updateCanvasImage(selectedId, {
          x: start.x + dx,
          y: start.y + dy,
        });
      });
    } else {
      canvasActions.updateCanvasImage(id, {
        x: pos.x,
        y: pos.y,
      });
    }
    multiDragRef.current = {
      active: false,
      draggedId: null,
      anchor: null,
      snapshots: new Map(),
    };
    setMultiSelectUnion(computeMultiSelectUnion(selectedIdsRef.current));
  };

  const handleItemSelect = (
    id: string,
    e: React.MouseEvent<SVGGElement> | React.PointerEvent<SVGGElement>,
  ) => {
    if (selectionBox.start) return;

    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      canvasActions.bringToFront(id);
      if (selectedIds.has(id)) {
        setPrimaryId(id);
      } else {
        const next = new Set([id]);
        setSelectedIds(next);
        setPrimaryId(id);
        setMultiSelectUnion(null);
      }
    } else {
      // Toggle
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
        if (primaryId === id) {
          const nextPrimary = Array.from(newSet)[0] || null;
          setPrimaryId(nextPrimary);
        }
      } else {
        newSet.add(id);
        setPrimaryId(id);
      }
      setSelectedIds(newSet);
      setMultiSelectUnion(computeMultiSelectUnion(newSet));
    }
  };

  const handleDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    const local = getLocalPointFromClient(e.clientX, e.clientY);
    if (!local) return;
    const pos = localToWorldPoint(local);
    const id = canvasActions.addTextToCanvas(pos.x, pos.y);
    setSelectedIds(new Set([id]));
    setPrimaryId(id);
    setMultiSelectUnion(null);
    setAutoEditId(id);
  };

  return (
    <div
      ref={containerRef}
      className={`flex-1 h-full overflow-hidden relative transition-colors outline-none focus:outline-none`}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => globalActions.setActiveArea("canvas")}
      onMouseDown={() => globalActions.setActiveArea("canvas")}
      onMouseEnter={handleCanvasMouseEnter}
    >
      <CanvasToolbar
        canvasFilters={canvasFilters}
        showMinimap={showMinimap}
        isExpanded={isCanvasToolbarExpanded}
        onFiltersChange={(filters) => canvasActions.setCanvasFilters(filters)}
        onToggleMinimap={() => canvasActions.toggleMinimap()}
        onAutoLayout={handleAutoLayout}
        onRequestClear={() => setIsClearModalOpen(true)}
        onToggleExpanded={() => canvasActions.toggleCanvasToolbarExpanded()}
      />
      {/* 四个定位角 */}
      {appSnap.mouseThrough && (
        <div className="inset-0 pointer-events-none z-1">
          {[
            { position: "top-1 right-1", path: "M2 2H22V22" },
            { position: "bottom-1 right-1", path: "M2 22H22V2" },
            { position: "bottom-1 left-1", path: "M22 22H2V2" },
          ].map((corner) => (
            <svg
              key={corner.position}
              className={`absolute ${corner.position}`}
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d={corner.path}
                stroke={THEME.primary}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDblClick}
        onWheel={handleWheel}
      >
        <g
          transform={`translate(${canvasViewport.x} ${canvasViewport.y}) scale(${canvasViewport.scale})`}
        >
          {(canvasState.canvasItems || []).map((item) => {
            if (item.type === "text") {
              return (
                <CanvasText
                  key={item.canvasId}
                  item={item}
                  isSelected={selectedIds.has(item.canvasId)}
                  showControls={
                    selectedIds.size === 1 &&
                    selectedIds.has(item.canvasId) &&
                    !appSnap.mouseThrough
                  }
                  isPanModifierActive={isSpaceDown}
                  stageScale={stageScale}
                  canvasOpacity={appSnap.canvasOpacity}
                  onDragStart={(pos) => handleDragStart(item.canvasId, pos)}
                  onDragMove={(pos) => handleDragMove(item.canvasId, pos)}
                  onDragEnd={(pos) => handleDragEnd(item.canvasId, pos)}
                  onSelect={(e) => handleItemSelect(item.canvasId, e)}
                  autoEdit={autoEditId === item.canvasId}
                  onAutoEditComplete={() => {
                    if (autoEditId === item.canvasId) {
                      setAutoEditId(null);
                    }
                  }}
                  onCommitEnter={() => {
                    const current = selectedIdsRef.current;
                    if (!(current.size === 1 && current.has(item.canvasId))) {
                      return;
                    }
                    setSelectedIds(new Set());
                    const nextPrimary =
                      primaryId === item.canvasId ? null : primaryId;
                    setPrimaryId(nextPrimary);
                    setMultiSelectUnion(null);
                  }}
                  onCommit={(newAttrs) => {
                    canvasActions.updateCanvasImage(item.canvasId, newAttrs);
                    setMultiSelectUnion(
                      computeMultiSelectUnion(selectedIdsRef.current),
                    );
                  }}
                  onDelete={() => {
                    canvasActions.removeFromCanvas(item.canvasId);
                    const newSet = new Set(selectedIds);
                    newSet.delete(item.canvasId);
                    setSelectedIds(newSet);
                    if (primaryId === item.canvasId) {
                      setPrimaryId(Array.from(newSet)[0] || null);
                    }
                    setMultiSelectUnion(computeMultiSelectUnion(newSet));
                  }}
                  onScaleStart={(client) =>
                    handleItemScaleStart(item.canvasId, client)
                  }
                />
              );
            }
            return (
              <CanvasImage
                key={item.canvasId}
                image={item as CanvasImageState}
                isSelected={selectedIds.has(item.canvasId)}
                showControls={
                  selectedIds.size === 1 &&
                  selectedIds.has(item.canvasId) &&
                  !appSnap.mouseThrough
                }
                isPanModifierActive={isSpaceDown}
                stageScale={stageScale}
                canvasOpacity={appSnap.canvasOpacity}
                onDragStart={(pos) => handleDragStart(item.canvasId, pos)}
                onDragMove={(pos) => handleDragMove(item.canvasId, pos)}
                onDragEnd={(pos) => handleDragEnd(item.canvasId, pos)}
                onSelect={(e) => handleItemSelect(item.canvasId, e)}
                onCommit={(newAttrs) => {
                  canvasActions.updateCanvasImage(item.canvasId, newAttrs);
                  setMultiSelectUnion(
                    computeMultiSelectUnion(selectedIdsRef.current),
                  );
                }}
                onDelete={() => {
                  canvasActions.removeFromCanvas(item.canvasId);
                  const newSet = new Set(selectedIds);
                  newSet.delete(item.canvasId);
                  setSelectedIds(newSet);
                  if (primaryId === item.canvasId) {
                    setPrimaryId(Array.from(newSet)[0] || null);
                  }
                  setMultiSelectUnion(computeMultiSelectUnion(newSet));
                }}
                onScaleStart={(client) =>
                  handleItemScaleStart(item.canvasId, client)
                }
                globalGrayscale={canvasGrayscale}
                globalFilters={canvasFilters}
              />
            );
          })}
          <MultiSelectOverlay
            union={selectionBox.start === null ? multiSelectUnion : null}
            stageScale={stageScale}
            onDeleteSelection={handleDeleteSelection}
            onFlipSelection={handleFlipSelection}
            onScaleStart={handleGroupScaleStart}
          />
          <SelectionRect selectionBox={selectionBox} />
        </g>
      </svg>
      {showMinimap && !shouldEnableMouseThrough && (
        <Minimap />
      )}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title={t("canvas.clearCanvasTitle")}
        message={t("canvas.clearCanvasMessage")}
        confirmText={t("canvas.clearCanvasConfirm")}
        variant="danger"
        onConfirm={() => {
          canvasActions.clearCanvas();
          setIsClearModalOpen(false);
        }}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </div>
  );
};
