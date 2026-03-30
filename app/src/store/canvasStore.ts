import { proxy } from 'valtio';
import {
  settingStorage,
  getSettingsSnapshot,
  readSetting,
  loadCanvasImages,
  getCanvasViewport,
saveCanvasViewport,
  localApi,
  type CanvasViewport,
} from '../service';
import { debounce } from 'radash';
import type {
  ImageMeta,
} from './galleryStore';

export interface CanvasText {
  type: 'text';
  canvasId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  scaleX?: number;
  text: string;
  fontSize: number;
  fill: string;
  width?: number;
  height?: number;
  align?: string;
}

export interface CanvasImage extends ImageMeta {
  type: 'image';
  canvasId: string;
  x: number;
  y: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  width?: number;
  height?: number;
  grayscale?: boolean; // Deprecated
  filters?: string[];
}

export type CanvasItem = CanvasImage | CanvasText;

export interface CanvasPersistedItem {
  type: 'image' | 'text';
  kind?: 'ref' | 'temp';
  canvasId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  
  // Image specific
  imageId?: string;
  imagePath?: string;
  dominantColor?: string | null;
  tone?: string | null;
  grayscale?: boolean; // Deprecated
  filters?: string[];
  
  // Temp image specific
  // name, localPath removed
  pageUrl?: string;
  tags?: string[];
  createdAt?: number;

  // Text specific
  text?: string;
  fontSize?: number;
  fill?: string;
  align?: string;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface CanvasSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasSelectionBoxState {
  start: CanvasPoint | null;
  current: CanvasPoint | null;
}

export const getRenderBbox = (
  width: number,
  height: number,
  rotationDeg: number,
) => {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const hw = width / 2;
  const hh = height / 2;

  // Corners relative to center
  // p1: -hw, -hh
  // p2: hw, -hh
  // p3: hw, hh
  // p4: -hw, hh

  const x1 = -hw * cos - -hh * sin;
  const y1 = -hw * sin + -hh * cos;

  const x2 = hw * cos - -hh * sin;
  const y2 = hw * sin + -hh * cos;

  const x3 = hw * cos - hh * sin;
  const y3 = hw * sin + hh * cos;

  const x4 = -hw * cos - hh * sin;
  const y4 = -hw * sin + hh * cos;

  const xs = [x1, x2, x3, x4];
  const ys = [y1, y2, y3, y4];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: minX,
    offsetY: minY,
  };
};

interface CanvasStoreState {
  canvasItems: CanvasItem[];
  canvasHistory: CanvasItem[][];
  canvasHistoryIndex: number;
  canvasViewport: CanvasViewport;
  canvasGrayscale: boolean; // Deprecated, kept for backward compatibility if needed, but UI should use canvasFilters
  canvasFilters: string[];
  showMinimap: boolean;
  isCanvasToolbarExpanded: boolean;

  isClearModalOpen: boolean;
  selectedIds: Set<string>;
  primaryId: string | null;
  autoEditId: string | null;
  dimensions: { width: number; height: number };
  isSpaceDown: boolean;
  multiSelectUnion: CanvasSelectionRect | null;
  selectionBox: CanvasSelectionBoxState;
  currentCanvasName: string;
}

const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  scale: 1,
};

export const canvasState = proxy<CanvasStoreState>({
  canvasItems: [],
  canvasHistory: [],
  canvasHistoryIndex: -1,
  canvasViewport: DEFAULT_CANVAS_VIEWPORT,
  canvasGrayscale: false,
  canvasFilters: [],
  showMinimap: true,
  isCanvasToolbarExpanded: true,
  isClearModalOpen: false,
  selectedIds: new Set<string>(),
  primaryId: null,
  autoEditId: null,
  dimensions: { width: 0, height: 0 },
  isSpaceDown: false,
  multiSelectUnion: null,
  selectionBox: {
    start: null,
    current: null,
  },
  currentCanvasName: "Default",
});

const cloneCanvasItem = (item: CanvasItem): CanvasItem => {
  if (item.type === 'text') {
    return { ...item };
  }
  const img = item as CanvasImage;
  return {
    ...img,
    tags: [...img.tags],
  };
};

const cloneCanvasItems = (items: CanvasItem[]): CanvasItem[] =>
  items.map(cloneCanvasItem);

const persistCanvasItems = async (items: CanvasItem[]) => {
  try {
    const normalized: CanvasPersistedItem[] = items.map((item) => {
      if (item.type === 'text') {
        return {
          type: 'text',
          canvasId: item.canvasId,
          x: item.x,
          y: item.y,
          rotation: item.rotation,
          scale: item.scale,
          scaleX: item.scaleX,
          text: item.text,
          fontSize: item.fontSize,
          fill: item.fill,
          width: item.width,
          height: item.height,
          align: item.align,
        };
      }

      const img = item as CanvasImage;
      const kind: CanvasPersistedItem['kind'] = img.imagePath.startsWith('temp-images/')
        ? 'temp'
        : 'ref';

      if (kind === 'temp') {
        return {
          type: 'image',
          kind: 'temp',
          canvasId: img.canvasId,
          x: img.x,
          y: img.y,
          rotation: img.rotation,
          scale: img.scale,
          scaleX: img.scaleX,
          scaleY: img.scaleY,
          width: img.width,
          height: img.height,
          grayscale: img.grayscale,
          imagePath: img.imagePath,
          pageUrl: img.pageUrl ?? undefined,
          tags: [...img.tags],
          createdAt: img.createdAt,
          dominantColor:
            typeof img.dominantColor === 'string' ? img.dominantColor : null,
          tone: typeof img.tone === 'string' ? img.tone : null,
        };
      }

      return {
        type: 'image',
        kind: 'ref',
        canvasId: img.canvasId,
        x: img.x,
        y: img.y,
        rotation: img.rotation,
        scale: img.scale,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
        grayscale: img.grayscale,
        imageId: img.id,
        imagePath: img.imagePath,
        dominantColor:
          typeof img.dominantColor === 'string' ? img.dominantColor : null,
        tone: typeof img.tone === 'string' ? img.tone : null,
      };
    });

    await localApi<{ success?: boolean }>('/api/save-canvas', {
      images: normalized,
      canvasName: canvasState.currentCanvasName,
    });
  } catch (error) {
    void error;
  }
};

const persistCanvasViewport = async (viewport: CanvasViewport) => {
  try {
    await saveCanvasViewport(viewport, canvasState.currentCanvasName);
  } catch (error) {
    void error;
  }
};

const debouncedPersistCanvasViewport = debounce({ delay: 500 }, persistCanvasViewport);

export const canvasActions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawCanvasGrayscale = readSetting<unknown>(
        settings,
        'canvasGrayscale',
        canvasState.canvasGrayscale,
      );
      const rawCanvasFilters = readSetting<unknown>(
        settings,
        'canvasFilters',
        canvasState.canvasFilters,
      );
      const rawShowMinimap = readSetting<unknown>(
        settings,
        'showMinimap',
        canvasState.showMinimap,
      );
      const rawIsCanvasToolbarExpanded = readSetting<unknown>(
        settings,
        'isCanvasToolbarExpanded',
        canvasState.isCanvasToolbarExpanded,
      );

      if (typeof rawCanvasGrayscale === 'boolean') {
        canvasState.canvasGrayscale = rawCanvasGrayscale;
      }

      if (Array.isArray(rawCanvasFilters)) {
        canvasState.canvasFilters = rawCanvasFilters as string[];
      } else if (canvasState.canvasGrayscale && canvasState.canvasFilters.length === 0) {
        // Migration from legacy boolean
        canvasState.canvasFilters = ['grayscale'];
      }

      if (typeof rawShowMinimap === 'boolean') {
        canvasState.showMinimap = rawShowMinimap;
      }

      if (typeof rawIsCanvasToolbarExpanded === 'boolean') {
        canvasState.isCanvasToolbarExpanded = rawIsCanvasToolbarExpanded;
      }
    } catch (error) {
      void error;
    }
  },

  setCanvasViewport: (viewport: CanvasViewport) => {
    canvasState.canvasViewport = { ...viewport };
    debouncedPersistCanvasViewport(canvasState.canvasViewport);
  },

  initCanvas: async (): Promise<void> => {
    try {
      const lastActive = await settingStorage.get<string>({
        key: 'lastActiveCanvas',
        fallback: 'Default',
      });
        canvasState.currentCanvasName = lastActive;

      const [itemsRaw, viewportRaw] = await Promise.all([
        loadCanvasImages<CanvasPersistedItem[]>(lastActive).catch(
          () => [] as CanvasPersistedItem[],
        ),
        getCanvasViewport<CanvasViewport | null>(lastActive).catch(() => null),
      ]);

      const persisted = Array.isArray(itemsRaw) ? itemsRaw : [];
      const reconstructed: CanvasItem[] = [];

      persisted.forEach((item) => {
        if (!item || typeof item !== 'object') return;

        if (item.type === 'text') {
          reconstructed.push({
            type: 'text',
            canvasId: item.canvasId,
            x: item.x,
            y: item.y,
            rotation: item.rotation,
            scale: item.scale,
            scaleX: item.scaleX,
            text: item.text || '',
            fontSize: item.fontSize || 24,
            fill: item.fill || '#000000',
            width: item.width || 0,
            height: item.height,
            align: item.align,
          });
          return;
        }

        if (item.kind === 'temp') {
          const temp = item;
          if (!temp.imagePath) return;
          const rawName = temp.imagePath.split(/[\\/]/).pop() || temp.imagePath;
          const dot = rawName.lastIndexOf('.');
          const filename = dot > 0 ? rawName.slice(0, dot) : rawName;

          const img: CanvasImage = {
            type: 'image',
            id: `temp_${temp.canvasId}`,
            filename,
            imagePath: temp.imagePath,
            pageUrl: temp.pageUrl,
            tags: Array.isArray(temp.tags) ? [...temp.tags] : [],
            createdAt: temp.createdAt || Date.now(),
            dominantColor: temp.dominantColor ?? null,
            tone: temp.tone ?? null,
            hasVector: false,
            canvasId: temp.canvasId,
            x: temp.x,
            y: temp.y,
            scale: temp.scale,
            scaleX: temp.scaleX,
            scaleY: temp.scaleY,
            rotation: temp.rotation,
            width: temp.width || 0,
            height: temp.height || 0,
            grayscale: temp.grayscale,
          };
          reconstructed.push(img);
          return;
        }

        if (item.kind === 'ref' || (!item.kind && item.type === 'image')) {
          const ref = item;
          if (!ref.imageId) return;

          // For ref images, we construct metadata from persisted info
          // This decouples canvas restoration from gallery state
          let filename = 'image';
          if (ref.imagePath) {
            const rawName = ref.imagePath.split(/[\\/]/).pop() || ref.imagePath;
            const dot = rawName.lastIndexOf('.');
            filename = dot > 0 ? rawName.slice(0, dot) : rawName;
          }

          const img: CanvasImage = {
            id: ref.imageId,
            filename,
            imagePath: ref.imagePath || '', // Should ideally have imagePath
            tags: [], // Tags not persisted for ref images currently
            createdAt: 0, // CreatedAt not persisted for ref images currently
            dominantColor: ref.dominantColor,
            tone: ref.tone,
            hasVector: false,
            type: 'image',
            canvasId: ref.canvasId,
            x: ref.x,
            y: ref.y,
            scale: ref.scale,
            scaleX: ref.scaleX,
            scaleY: ref.scaleY,
            rotation: ref.rotation,
            width: ref.width || 0,
            height: ref.height || 0,
            grayscale: ref.grayscale,
          };
          reconstructed.push(img);
        }
      });

      canvasState.canvasItems = reconstructed;
      canvasState.canvasHistory = [cloneCanvasItems(reconstructed)];
      canvasState.canvasHistoryIndex = 0;

      if (
        viewportRaw &&
        typeof viewportRaw.x === 'number' &&
        typeof viewportRaw.y === 'number' &&
        typeof viewportRaw.width === 'number' &&
        typeof viewportRaw.height === 'number' &&
        typeof viewportRaw.scale === 'number'
      ) {
        canvasState.canvasViewport = { ...viewportRaw };
      }
    } catch (error) {
      void error;
      canvasState.canvasItems = [];
      canvasState.canvasHistory = [[]];
      canvasState.canvasHistoryIndex = 0;
    }
  },

  switchCanvas: async (name: string, skipSave = false) => {
    if (name === canvasState.currentCanvasName) return;

    if (!skipSave) {
      // Save current viewport
      await saveCanvasViewport(
        canvasState.canvasViewport,
        canvasState.currentCanvasName,
      );
    }

    // Update storage
    await settingStorage.set('lastActiveCanvas', name);

    // Clear state
    canvasState.canvasItems = [];
    canvasState.canvasHistory = [[]];
    canvasState.canvasHistoryIndex = 0;

    // Init (which will read lastActiveCanvas and load)
    await canvasActions.initCanvas();
  },

  commitCanvasChange: () => {
    const snapshot = cloneCanvasItems(canvasState.canvasItems);
    const nextIndex = canvasState.canvasHistoryIndex + 1;

    const current =
      canvasState.canvasHistoryIndex >= 0
        ? canvasState.canvasHistory[canvasState.canvasHistoryIndex]
        : null;
    if (current && JSON.stringify(current) === JSON.stringify(snapshot)) {
      return;
    }

    canvasState.canvasHistory = canvasState.canvasHistory.slice(0, nextIndex);
    canvasState.canvasHistory.push(snapshot);
    canvasState.canvasHistoryIndex = nextIndex;

    if (canvasState.canvasHistory.length > 50) {
      canvasState.canvasHistory.shift();
      canvasState.canvasHistoryIndex--;
    }

    void persistCanvasItems(canvasState.canvasItems);
  },

  undoCanvas: () => {
    if (canvasState.canvasHistoryIndex > 0) {
      canvasState.canvasHistoryIndex--;
      canvasState.canvasItems = cloneCanvasItems(
        canvasState.canvasHistory[canvasState.canvasHistoryIndex],
      );
      void persistCanvasItems(canvasState.canvasItems);
    }
  },

  redoCanvas: () => {
    if (canvasState.canvasHistoryIndex < canvasState.canvasHistory.length - 1) {
      canvasState.canvasHistoryIndex++;
      canvasState.canvasItems = cloneCanvasItems(
        canvasState.canvasHistory[canvasState.canvasHistoryIndex],
      );
      void persistCanvasItems(canvasState.canvasItems);
    }
  },

  addTextToCanvas: (x: number, y: number) => {
    const id = `text_${Date.now()}`;
    canvasState.canvasItems.push({
      type: 'text',
      canvasId: id,
      x,
      y,
      rotation: 0,
      scale: 1,
      scaleX: 1,
      text: 'Double click to edit',
      fontSize: 96,
      fill: '#ffffff',
    });
    canvasActions.commitCanvasChange();
    return id;
  },

  addToCanvas: (image: ImageMeta, x?: number, y?: number) => {
    let targetX = x;
    let targetY = y;

    if (typeof targetX !== 'number' || typeof targetY !== 'number') {
      const index = canvasState.canvasItems.length;
      const columns = 4;
      const spacingX = 260;
      const spacingY = 260;
      const baseX = 120;
      const baseY = 80;
      const col = index % columns;
      const row = Math.floor(index / columns);

      targetX = baseX + col * spacingX;
      targetY = baseY + row * spacingY;
    }

    const canvasId = `img_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    canvasState.canvasItems.push({
      type: 'image',
      ...image,
      canvasId,
      x: targetX,
      y: targetY,
      scale: 1,
      rotation: 0,
    });
    canvasActions.commitCanvasChange();
  },

  updateCanvasImageTransient: (canvasId: string, props: Partial<CanvasItem>) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.canvasId === canvasId,
    );
    if (index !== -1) {
      Object.assign(canvasState.canvasItems[index], props);
    }
  },

  updateCanvasImageSilent: (canvasId: string, props: Partial<CanvasItem>) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.canvasId === canvasId,
    );
    if (index !== -1) {
      Object.assign(canvasState.canvasItems[index], props);
    }
  },

  updateCanvasImage: (canvasId: string, props: Partial<CanvasItem>) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.canvasId === canvasId,
    );
    if (index !== -1) {
      Object.assign(canvasState.canvasItems[index], props);
      canvasActions.commitCanvasChange();
    }
  },

  removeFromCanvas: (canvasId: string) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.canvasId === canvasId,
    );
    if (index !== -1) {
      canvasState.canvasItems.splice(index, 1);
      canvasActions.commitCanvasChange();
    }
  },

  removeManyFromCanvas: (canvasIds: string[]) => {
    if (!canvasIds.length) return;
    const idSet = new Set(canvasIds);
    canvasState.canvasItems = canvasState.canvasItems.filter(
      (img) => !idSet.has(img.canvasId),
    );
    canvasActions.commitCanvasChange();
  },

  removeImageFromCanvas: (imageId: string) => {
    const prevLen = canvasState.canvasItems.length;
    canvasState.canvasItems = canvasState.canvasItems.filter((img) => {
      if (img.type === 'text') return true;
      return img.id !== imageId;
    });
    if (canvasState.canvasItems.length !== prevLen) {
      canvasActions.commitCanvasChange();
    }
  },

  autoLayoutCanvas: (
    targetIds?: string[],
    options?: { startX: number; startY: number },
  ) => {
    if (canvasState.canvasItems.length === 0) return;

    const gap = 20;
    const startX = options?.startX ?? 100;
    const startY = options?.startY ?? 100;

    const imageEntries = canvasState.canvasItems
      .map((item, index) => ({ item, index }))
      .filter(
        (entry): entry is { item: CanvasImage; index: number } =>
          entry.item.type === 'image' &&
          (!targetIds ||
            targetIds.length === 0 ||
            targetIds.includes(entry.item.canvasId)),
      );

    const rects = imageEntries.map(({ item, index }) => {
      const scale = item.scale || 1;
      const rawW = (item.width || 250) * scale * Math.abs(item.scaleX || 1);
      const rawH = (item.height || 200) * scale * Math.abs(item.scaleY || 1);
      const bbox = getRenderBbox(rawW, rawH, item.rotation || 0);
      return {
        item,
        index,
        w: bbox.width,
        h: bbox.height,
        offsetX: bbox.offsetX,
        offsetY: bbox.offsetY,
      };
    });
    if (rects.length === 0) return;

    let totalArea = 0;
    let totalWidth = 0;

    rects.forEach((r) => {
      totalArea += r.w * r.h;
      totalWidth += r.w;
    });

    const isLocalLayout = Array.isArray(targetIds) && targetIds.length > 0;
    
    const sortedWidths = rects.map((r) => r.w).sort((a, b) => a - b);
    const medianRectWidth =
      sortedWidths.length > 0
        ? sortedWidths[Math.floor(sortedWidths.length / 2)]
        : 250;
    // Use median width as the effective width to calculate columns, 
    // so that a single very large image doesn't force a single column layout.
    const averageRectWidth = rects.length > 0 ? totalWidth / rects.length : 250;
    const effectiveRectWidth = medianRectWidth > 0 ? medianRectWidth : averageRectWidth;

    const baseSide =
      totalArea > 0
        ? Math.sqrt(totalArea)
        : Math.sqrt(effectiveRectWidth * effectiveRectWidth * rects.length);

    const viewportScale =
      typeof canvasState.canvasViewport.scale === 'number' &&
      canvasState.canvasViewport.scale > 0
        ? canvasState.canvasViewport.scale
        : 1;
    const viewportWidth =
      typeof canvasState.dimensions.width === 'number'
        ? canvasState.dimensions.width / viewportScale
        : 0;
    const viewportHeight =
      typeof canvasState.dimensions.height === 'number'
        ? canvasState.dimensions.height / viewportScale
        : 0;

    let targetAspect = 1;
    if (!isLocalLayout && viewportWidth > 0 && viewportHeight > 0) {
      targetAspect = viewportWidth / viewportHeight;
    }

    // We want the final layout aspect ratio to match the viewport aspect ratio.
    // Since the canvas is zoomable, we don't care about absolute width overflow,
    // only about the shape (aspect ratio).
    const maxColumns = Math.max(1, rects.length);

    // Initial guess based on area to get a square-ish layout if targetAspect is 1
    const baseColumns = Math.max(
      1,
      Math.round(baseSide * Math.sqrt(targetAspect) / effectiveRectWidth),
    );

    const sortedRects = rects.slice().sort((a, b) => {
      if (b.h !== a.h) return b.h - a.h;
      return a.index - b.index;
    });

    const findShortestColumnIndex = (heights: number[]) => {
      let bestIndex = 0;
      let bestHeight = heights[0] ?? startY;
      for (let i = 1; i < heights.length; i++) {
        const height = heights[i] ?? startY;
        if (height < bestHeight) {
          bestHeight = height;
          bestIndex = i;
        }
      }
      return bestIndex;
    };

    const simulateLayout = (columnCount: number) => {
      const columnHeights = new Array(columnCount).fill(startY);
      const columnMaxWidths = new Array(columnCount).fill(0);

      sortedRects.forEach((r) => {
        const colIndex = findShortestColumnIndex(columnHeights);
        columnMaxWidths[colIndex] = Math.max(columnMaxWidths[colIndex], r.w);
        columnHeights[colIndex] += r.h + gap;
      });

      const width =
        columnMaxWidths.reduce((sum, w) => sum + (w > 0 ? w : 0), 0) +
        gap * Math.max(0, columnCount - 1);
      const height = Math.max(...columnHeights) - startY;
      return { width, height };
    };

    const scoreColumns = (columnCount: number) => {
      const metrics = simulateLayout(columnCount);
      const currentAspect =
        metrics.height > 0 ? metrics.width / metrics.height : Number.POSITIVE_INFINITY;
      const safeCurrentAspect = currentAspect > 0 ? currentAspect : 1e-6;
      const safeTargetAspect = targetAspect > 0 ? targetAspect : 1;
      
      // Score based purely on how close the aspect ratio is to the target
      const aspectScore = Math.abs(
        Math.log(safeCurrentAspect / safeTargetAspect),
      );

      return { columns: columnCount, score: aspectScore };
    };

    const isBetterCandidate = (
      candidate: { columns: number; score: number },
      currentBest: { columns: number; score: number },
    ) => {
      if (candidate.score < currentBest.score - 1e-6) return true;
      if (Math.abs(candidate.score - currentBest.score) > 1e-6) return false;
      // If scores are equal, prefer the one closer to the base column count (stability)
      return (
        Math.abs(candidate.columns - baseColumns) <
        Math.abs(currentBest.columns - baseColumns)
      );
    };

    let columns = baseColumns;
    if (maxColumns > 1) {
      let best = scoreColumns(baseColumns);
      for (let candidate = 1; candidate <= maxColumns; candidate++) {
        const scored = scoreColumns(candidate);
        if (isBetterCandidate(scored, best)) best = scored;
      }
      columns = best.columns;
    }

    const columnHeights = new Array(columns).fill(startY);
    const columnMaxWidths = new Array(columns).fill(0);
    const assignedColById = new Map<string, number>();

    sortedRects.forEach((r) => {
      const colIndex = findShortestColumnIndex(columnHeights);

      r.item.y = columnHeights[colIndex] - r.offsetY;
      assignedColById.set(r.item.canvasId, colIndex);

      columnMaxWidths[colIndex] = Math.max(columnMaxWidths[colIndex], r.w);
      columnHeights[colIndex] += r.h + gap;
    });

    const columnXs: number[] = [];
    let currentX = startX;
    for (let i = 0; i < columns; i++) {
      columnXs[i] = currentX;
      if (columnMaxWidths[i] > 0) {
        currentX += columnMaxWidths[i] + gap;
      }
    }

    const rectMap = new Map(rects.map((r) => [r.item.canvasId, r]));

    canvasState.canvasItems.forEach((item) => {
      const colIndex = assignedColById.get(item.canvasId);
      if (typeof colIndex === 'number') {
        const r = rectMap.get(item.canvasId);
        const offsetX = r ? r.offsetX : 0;
        item.x = columnXs[colIndex] - offsetX;
      }
    });

    canvasActions.commitCanvasChange();
  },

  clearCanvas: () => {
    if (canvasState.canvasItems.length === 0) return;

    canvasState.canvasItems = [];
    canvasActions.commitCanvasChange();
  },

  bringToFront: (canvasId: string) => {
    const index = canvasState.canvasItems.findIndex(
      (img) => img.canvasId === canvasId,
    );
    if (index !== -1 && index !== canvasState.canvasItems.length - 1) {
      const [img] = canvasState.canvasItems.splice(index, 1);
      canvasState.canvasItems.push(img);
      void persistCanvasItems(canvasState.canvasItems);
    }
  },

  toggleCanvasGrayscale: () => {
    // Legacy support: toggle 'grayscale' in canvasFilters
    const hasGrayscale = canvasState.canvasFilters.includes('grayscale');
    if (hasGrayscale) {
      canvasState.canvasFilters = canvasState.canvasFilters.filter(f => f !== 'grayscale');
      canvasState.canvasGrayscale = false;
    } else {
      canvasState.canvasFilters = [...canvasState.canvasFilters, 'grayscale'];
      canvasState.canvasGrayscale = true;
    }
    void settingStorage.set('canvasFilters', canvasState.canvasFilters);
    void settingStorage.set('canvasGrayscale', canvasState.canvasGrayscale);
  },

  setCanvasFilters: (filters: string[]) => {
    canvasState.canvasFilters = filters;
    // Sync legacy flag
    canvasState.canvasGrayscale = filters.includes('grayscale');
    void settingStorage.set('canvasFilters', filters);
    void settingStorage.set('canvasGrayscale', canvasState.canvasGrayscale);
  },

  toggleCanvasToolbarExpanded: () => {
    canvasState.isCanvasToolbarExpanded = !canvasState.isCanvasToolbarExpanded;
    void settingStorage.set(
      'isCanvasToolbarExpanded',
      canvasState.isCanvasToolbarExpanded,
    );
  },

  toggleMinimap: () => {
    canvasState.showMinimap = !canvasState.showMinimap;
    void settingStorage.set('showMinimap', canvasState.showMinimap);
  },

  cancelPendingSave: () => {
    debouncedPersistCanvasViewport.cancel();
  },
};
