import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { flushSync } from "react-dom";
import Masonry from "react-masonry-css";
import { globalActions, globalState } from "../store/globalStore";
import {
  state as galleryState,
  actions,
  type GallerySort,
  deriveNameFromFilename,
  getImageUrl,
  type SearchResult,
} from "../store/galleryStore";
import type { ImageMeta } from "../store/galleryStore";
import { useSnapshot } from "valtio";
import { debounce } from "radash";
import { Tag } from "./Tag";
import { THEME } from "../theme";
import { SortableGalleryItem } from "./gallery/GalleryItem";
import { importDroppedData } from "../utils/import";
import {
  clearExternalDragSession,
  markExternalDragSession,
} from "../utils/externalDragSession";
import {
  indexImages,
  localApi,
  openImageInFolder,
  updateImage,
  moveGalleryOrder,
} from "../service";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Swatch } from "./gallery/Swatch";
import { ColorInput } from "./gallery/ColorInput";
import { DragOverlayItem } from "./gallery/DragOverlayItem";
import {
  GalleryContextMenu,
  type ContextMenuState,
} from "./gallery/GalleryContextMenu";
import { GalleryEmptyState } from "./gallery/EmptyState";
import { GalleryHeader } from "./gallery/GalleryHeader";
import { onOpenTagColorPicker } from "../events/uiEvents";
import { useT } from "../i18n/useT";

const ensureTags = (tags: string[] | undefined | null): string[] =>
  Array.isArray(tags) ? tags : [];

const POPOVER_WIDTH = 248;
const GALLERY_ROW_HEIGHT = 120;
const GALLERY_LIMIT_MIN = 12;
const GALLERY_LIMIT_BUFFER = 1.4;
// 当 newLimit 与 prev 差值不超过该阈值时，不更新 limit，避免 ResizeObserver 抖动触发重复请求
const GALLERY_LIMIT_DELTA = 6;
const GALLERY_RESIZE_MIN_WIDTH = 180;
const GALLERY_RESIZE_MIN_HEIGHT = 180;

const clampPopover = (x: number, y: number) => {
  const nextX = Math.min(
    Math.max(12, x),
    window.innerWidth - POPOVER_WIDTH - 12,
  );
  const nextY = Math.max(12, y);
  return { x: nextX, y: nextY };
};

const sortImagesForGallery = (images: ImageMeta[], sort: GallerySort) => {
  // Check if images contain vector results
  const hasVectorResults = images.some((img) => img.isVectorResult);

  if (hasVectorResults) {
    const textMatches: ImageMeta[] = [];
    const vectorMatches: SearchResult[] = [];

    for (const img of images) {
      if (img.isVectorResult) {
        vectorMatches.push(img as SearchResult);
      } else {
        textMatches.push(img);
      }
    }

    // Sort vector matches by score
    vectorMatches.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Text matches usually come first and are sorted by backend/store logic
    // We put text matches FIRST, then vector matches
    return [...textMatches, ...vectorMatches];
  }

  if (sort === "createdAtDesc") {
    return [...images].sort((a, b) => b.createdAt - a.createdAt);
  }
  return images;
};

export const Gallery: React.FC = () => {
  const snap = useSnapshot(galleryState);
  const appSnap = useSnapshot(globalState);
  const { t } = useT();

  // Drag Overlay State
  const [activeImage, setActiveImage] = useState<ImageMeta | null>(null);
  const [activeSize, setActiveSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeTagSize, setActiveTagSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const dragOutTriggeredRef = useRef(false);
  const [dndContextKey, setDndContextKey] = useState(0);

  const dragOverlay = useMemo(() => {
    if (activeImage && activeSize) {
      return {
        size: activeSize,
        className: "rounded overflow-hidden shadow-2xl opacity-90",
        content: (
          <img
            src={getImageUrl(activeImage.imagePath)}
            className="w-full h-full object-cover bg-neutral-800"
            alt=""
          />
        ),
      };
    }

    if (activeTag) {
      return {
        size: activeTagSize,
        className: "opacity-95",
        content: <Tag tag={activeTag} showColor={false} size="md" />,
      };
    }

    return null;
  }, [activeImage, activeSize, activeTag, activeTagSize]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [tagColorPicker, setTagColorPicker] = useState<{
    tag: string;
    x: number;
    y: number;
  } | null>(null);

  const [dominantColorPicker, setDominantColorPicker] = useState<{
    imageId: string;
    x: number;
    y: number;
    draft: string;
  } | null>(null);
  const hasInitializedLimitReloadRef = useRef(false);

  // Dynamic Columns
  const galleryRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(2);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    return onOpenTagColorPicker(({ tag, x, y }) => {
      const next = clampPopover(x, y + 8);
      setTagColorPicker({ tag, x: next.x, y: next.y });
    });
  }, []);

  useEffect(() => {
    if (!galleryRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        // 浮窗模式下主窗口会收缩到极小尺寸，若继续按当前可视区重算 limit，
        // 会触发 resetSearchResults -> reload，导致结果列表先清空再出现。
        if (
          width < GALLERY_RESIZE_MIN_WIDTH ||
          height < GALLERY_RESIZE_MIN_HEIGHT
        ) {
          return;
        }
        // Calculate columns based on width.
        // Assuming ~120px per column is a good size to ensure 2 columns at default width (250px)
        const cols = Math.max(1, Math.floor(width / 120));
        setColumnCount(cols);

        // Calculate limit based on viewport size
        // Assuming average item height ~250px
        const rows = Math.max(1, Math.ceil(height / GALLERY_ROW_HEIGHT));
        const newLimit = Math.max(
          GALLERY_LIMIT_MIN,
          Math.round(rows * cols * GALLERY_LIMIT_BUFFER),
        );
        // Use direct state access to avoid dependency cycle in useEffect
        if (Math.abs(galleryState.limit - newLimit) > GALLERY_LIMIT_DELTA) {
          actions.setLimit(newLimit);
        }
      }
    });
    observer.observe(galleryRef.current);
    return () => observer.disconnect();
  }, []);

  const loadImages = useCallback((isReload: boolean, currentLimit: number) => {
    void actions.loadImages(isReload, currentLimit);
  }, []);

  const debouncedReload = useMemo(
    () =>
      debounce({ delay: 400 }, (nextLimit: number) => {
        actions.resetSearchResults();
        void loadImages(true, nextLimit);
      }),
    [loadImages],
  );

  const debouncedLimitReload = useMemo(
    () =>
      debounce({ delay: 400 }, (nextLimit: number) => {
        void loadImages(true, nextLimit);
      }),
    [loadImages],
  );

  // 搜索条件变化时，清空旧结果并重新请求。
  useEffect(() => {
    debouncedReload(galleryState.limit);
  }, [
    snap.searchQuery,
    snap.searchImage,
    snap.searchTags,
    snap.searchColor,
    snap.searchTone,
    appSnap.enableVectorSearch,
    debouncedReload,
  ]);

  // 仅窗口尺寸导致的 limit 变化，不先清空结果，避免拖拽/缩放窗口时闪屏。
  useEffect(() => {
    if (!hasInitializedLimitReloadRef.current) {
      hasInitializedLimitReloadRef.current = true;
      return;
    }
    debouncedLimitReload(snap.limit);
  }, [snap.limit, debouncedLimitReload]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (
      scrollHeight - scrollTop - clientHeight < 500 &&
      snap.hasMore &&
      !snap.loading &&
      !snap.vectorLoading
    ) {
      void loadImages(false, snap.limit);
    }
  };

  useEffect(() => {
    return () => {
      actions.cancelLoad();
      debouncedReload.cancel();
      debouncedLimitReload.cancel();
    };
  }, [debouncedLimitReload, debouncedReload]);

  const allTags = useMemo(() => {
    const unsorted = [...snap.tags];
    const order = snap.tagSortOrder || [];
    const orderMap = new Map(order.map((t, i) => [t, i]));

    return unsorted.sort((a, b) => {
      const indexA = orderMap.has(a) ? orderMap.get(a)! : 999999;
      const indexB = orderMap.has(b) ? orderMap.get(b)! : 999999;
      if (indexA !== indexB) return indexA - indexB;
      return a.localeCompare(b);
    });
  }, [snap.tags, snap.tagSortOrder]);

  const sortedImages = useMemo(
    () => sortImagesForGallery(snap.images as ImageMeta[], snap.gallerySort),
    [snap.images, snap.gallerySort],
  );
  const importTagPreviewSet = useMemo(
    () => new Set(snap.importTagPreviewImageIds),
    [snap.importTagPreviewImageIds],
  );

  const handleDragStart = (event: DragStartEvent) => {
    dragOutTriggeredRef.current = false;
    const { active } = event;
    const activeId = active.id as string;

    if (allTags.includes(activeId)) {
      // Tag 使用 DragOverlay，尺寸从 active rect 读取，避免依赖 DOM id（Tag 名可能包含空格）
      setActiveTag(activeId);

      const rect = event.active.rect.current;
      const width = rect?.initial?.width ?? rect?.translated?.width;
      const height = rect?.initial?.height ?? rect?.translated?.height;
      if (typeof width === "number" && typeof height === "number") {
        setActiveTagSize({ width, height });
      } else {
        setActiveTagSize(null);
      }
      return;
    }

    const image = snap.images.find((i) => i.id === active.id);
    if (image) {
      setActiveImage(image as unknown as ImageMeta);
      const el = document.getElementById(active.id as string);
      if (el) {
        setActiveSize({ width: el.offsetWidth, height: el.offsetHeight });
      }
    }
  };

  const resetActiveDragState = () => {
    setActiveImage(null);
    setActiveSize(null);
    setActiveTag(null);
    setActiveTagSize(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    const hasStartedExternalDrag = dragOutTriggeredRef.current;
    dragOutTriggeredRef.current = false;
    resetActiveDragState();

    if (hasStartedExternalDrag) {
      return;
    }

    if (!over || active.id === over.id) return;

    if (allTags.includes(active.id as string)) {
      const oldIndex = allTags.indexOf(active.id as string);
      const newIndex = allTags.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(allTags, oldIndex, newIndex);
      actions.setTagSortOrder(newOrder);
    } else {
      const oldIndexAll = snap.images.findIndex((i) => i.id === active.id);
      const newIndexAll = snap.images.findIndex((i) => i.id === over.id);

      if (oldIndexAll === -1 || newIndexAll === -1) {
        return;
      }

      const currentImages = [...snap.images];
      const newImages = arrayMove(currentImages, oldIndexAll, newIndexAll);
      void moveGalleryOrder(active.id as string, over.id as string);
      actions.reorderImages(newImages as ImageMeta[]);
    }
  };

  const handleDragCancel = () => {
    dragOutTriggeredRef.current = false;
    resetActiveDragState();
  };

  useEffect(() => {
    if (!activeImage) {
      return;
    }

    let isDisposed = false;

    const tryStartExternalDrag = () => {
      if (isDisposed || dragOutTriggeredRef.current) {
        return;
      }

      dragOutTriggeredRef.current = true;
      markExternalDragSession(activeImage);
      flushSync(() => {
        setDndContextKey((current) => current + 1);
        resetActiveDragState();
      });

      void window.electron
        ?.startImageDrag?.({
          imagePath: activeImage.imagePath,
          fallbackIconPath: activeImage.imagePath,
        })
        .then((result) => {
          if (!result?.success) {
            dragOutTriggeredRef.current = false;
            clearExternalDragSession();
          }
        });
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pointerLeftWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;

      if (pointerLeftWindow) {
        tryStartExternalDrag();
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget === null) {
        tryStartExternalDrag();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("mouseout", handleMouseOut, true);

    return () => {
      isDisposed = true;
      window.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
    };
  }, [activeImage]);

  const handleContextMenu = (e: React.MouseEvent, image: ImageMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, image });
  };

  const closeContextMenu = () => setContextMenu(null);

  const updateContextMenuImage = useCallback(
    (imageId: string, nextImage: ImageMeta) => {
      setContextMenu((current) => {
        if (!current || current.image.id !== imageId) {
          return current;
        }
        return {
          ...current,
          image: nextImage,
        };
      });
    },
    [],
  );

  const closeContextMenuIfMatch = useCallback((imageId: string) => {
    setContextMenu((current) => {
      if (!current || current.image.id !== imageId) {
        return current;
      }
      return null;
    });
  }, []);

  const handleUpdateDominantColor = useCallback(
    async (image: ImageMeta, dominantColor: string | null) => {
      try {
        const data = await updateImage<{ success?: boolean; meta?: ImageMeta }>(
          image.id,
          { dominantColor },
        );
        if (data && data.meta) {
          actions.updateImage(image.id, data.meta);
          updateContextMenuImage(image.id, data.meta);
        } else {
          actions.updateImage(image.id, { dominantColor });
          updateContextMenuImage(image.id, {
            ...image,
            dominantColor,
          });
        }
      } catch (e) {
        console.error(e);
        globalActions.pushToast(
          { key: "toast.updateDominantColorFailed" },
          "error",
        );
      }
    },
    [updateContextMenuImage],
  );

  const debouncedUpdateDominantColor = useMemo(
    () =>
      debounce({ delay: 150 }, (imageId: string, color: string) => {
        const image =
          galleryState.images.find((i) => i.id === imageId) ||
          contextMenu?.image;
        if (!image || image.id !== imageId) return;
        void handleUpdateDominantColor(image as ImageMeta, color);
      }),
    [contextMenu, handleUpdateDominantColor],
  );

  useEffect(() => {
    return () => {
      debouncedUpdateDominantColor.cancel();
    };
  }, [debouncedUpdateDominantColor]);

  const handleUpdateName = async (image: ImageMeta, name: string) => {
    const newMeta = await actions.requestUpdateImageName(image, name);
    if (newMeta) {
      updateContextMenuImage(image.id, newMeta);
    }
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    const targetImage = contextMenu.image;
    const success = await actions.requestDeleteImage(targetImage);
    if (success) {
      closeContextMenuIfMatch(targetImage.id);
    }
  };

  const handleReindex = async () => {
    if (!contextMenu) return;
    const targetImage = contextMenu.image;
    try {
      const data = await indexImages<{
        success?: boolean;
        meta?: ImageMeta;
      }>({
        imageId: targetImage.id,
      });

      if (data && data.success && data.meta) {
        actions.updateImage(targetImage.id, data.meta);
        updateContextMenuImage(targetImage.id, data.meta);
        globalActions.pushToast({ key: "toast.vectorIndexed" }, "success");
      } else {
        globalActions.pushToast({ key: "toast.vectorIndexFailed" }, "error");
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.vectorIndexFailed" }, "error");
    }
    closeContextMenuIfMatch(targetImage.id);
  };

  const handleOpenFile = async () => {
    if (!contextMenu) return;
    const targetImageId = contextMenu.image.id;
    try {
      await openImageInFolder(targetImageId);
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
    }
    closeContextMenuIfMatch(targetImageId);
  };

  const handleCopyImage = async () => {
    if (!contextMenu) return;
    const targetImageId = contextMenu.image.id;
    try {
      await localApi<{ success?: boolean }>("/api/copy-image", {
        id: targetImageId,
      });
      globalActions.pushToast({ key: "toast.imageCopied" }, "success");
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.copyImageFailed" }, "error");
    }
    closeContextMenuIfMatch(targetImageId);
  };

  const handleSearchByImage = () => {
    if (!contextMenu) return;
    const targetImage = contextMenu.image;
    actions.setSearchImageSource({
      type: "library",
      imageId: targetImage.id,
      previewUrl: getImageUrl(targetImage.imagePath),
      previewName: deriveNameFromFilename(targetImage.filename) || t("gallery.searchImage.defaultName"),
    });
    closeContextMenuIfMatch(targetImage.id);
  };

  const handleImageClick = (image: ImageMeta) => {
    const request = window.electron?.openGalleryPreviewWindow?.({
      activeImageId: image.id,
      images: sortedImages.map((item) => ({
        id: item.id,
        filename: item.filename,
        imagePath: item.imagePath,
      })),
    });

    if (!request) {
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
      return;
    }

    void request.then((result) => {
      if (result?.success) {
        return;
      }
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
    });
  };

  const handleUpdateTags = useCallback(
    async (image: ImageMeta, tags: string[]) => {
      try {
        const data = await updateImage<{ success?: boolean; meta?: ImageMeta }>(
          image.id,
          {
            tags,
          },
        );
        if (data && data.meta) {
          actions.updateImage(image.id, data.meta);
          updateContextMenuImage(image.id, data.meta);
        } else {
          actions.updateImage(image.id, { tags });
          updateContextMenuImage(image.id, {
            ...image,
            tags,
          });
        }
        void actions.loadTags();
      } catch (e) {
        console.error(e);
        globalActions.pushToast({ key: "toast.updateTagsFailed" }, "error");
      }
    },
    [updateContextMenuImage],
  );

  const handleAddTag = async (image: ImageMeta, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;

    const currentTags = ensureTags(image.tags as string[]);
    if (currentTags.includes(trimmed)) {
      return;
    }

    const newTags = [...currentTags, trimmed];
    await handleUpdateTags(image, newTags);
  };

  const handleRemoveTag = async (image: ImageMeta, tag: string) => {
    const currentTags = ensureTags(image.tags as string[]);
    const newTags = currentTags.filter((t) => t !== tag);

    await handleUpdateTags(image, newTags);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await importDroppedData(e.dataTransfer);
    } catch (error) {
      console.error("Error importing dropped image", error);
      globalActions.pushToast({ key: "toast.importImageFailed" }, "error");
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-neutral-950 transition-colors"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => e.preventDefault()}
    >
      <DndContext
        key={dndContextKey}
        sensors={sensors}
        collisionDetection={closestCenter}
        cancelDrop={() => dragOutTriggeredRef.current}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <GalleryHeader
          loading={snap.loading || snap.vectorLoading}
          allTags={allTags}
        />

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-0 scrollbar-hide"
          ref={galleryRef}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => e.preventDefault()}
          onScroll={handleScroll}
        >
          {snap.images.length === 0 ? (
            <GalleryEmptyState />
          ) : (
            <SortableContext
              items={sortedImages.map((image) => image.id)}
              strategy={rectSortingStrategy}
            >
              <Masonry
                breakpointCols={columnCount}
                className="flex w-auto -ml-4"
                columnClassName="pl-4 bg-clip-padding"
              >
                {sortedImages.map((image) => (
                  <SortableGalleryItem
                    key={image.id}
                    image={image as ImageMeta}
                    enableVectorSearch={appSnap.enableVectorSearch}
                    showTagsPreview={importTagPreviewSet.has(image.id)}
                    onContextMenu={(e) => {
                      handleContextMenu(e, image as ImageMeta);
                    }}
                    onClick={handleImageClick}
                  />
                ))}
              </Masonry>
            </SortableContext>
          )}
        </div>
        <DragOverlay>
          {dragOverlay ? (
            <DragOverlayItem
              size={dragOverlay.size}
              className={dragOverlay.className}
            >
              {dragOverlay.content}
            </DragOverlayItem>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <GalleryContextMenu
          key={contextMenu.image.id}
          value={contextMenu}
          image={
            (snap.images.find(
              (i) => i.id === contextMenu.image.id,
            ) as ImageMeta) || contextMenu.image
          }
          allTags={allTags}
          enableVectorSearch={appSnap.enableVectorSearch}
          onClose={closeContextMenu}
          onCopyImage={handleCopyImage}
          onOpenFile={handleOpenFile}
          onSearchByImage={handleSearchByImage}
          onDelete={handleDelete}
          onReindex={handleReindex}
          onOpenDominantColorPicker={({ x, y }) => {
            const next = clampPopover(x, y + 16);
            const activeImage =
              (snap.images.find(
                (i) => i.id === contextMenu.image.id,
              ) as ImageMeta) || contextMenu.image;
            const current = activeImage.dominantColor || THEME.primary;
            setDominantColorPicker({
              imageId: contextMenu.image.id,
              x: next.x,
              y: next.y,
              draft: current,
            });
          }}
          onUpdateName={(name) => {
            const activeImage =
              (snap.images.find(
                (i) => i.id === contextMenu.image.id,
              ) as ImageMeta) || contextMenu.image;
            handleUpdateName(activeImage, name);
          }}
          onAddTag={(tag) => {
            const activeImage =
              (snap.images.find(
                (i) => i.id === contextMenu.image.id,
              ) as ImageMeta) || contextMenu.image;
            handleAddTag(activeImage, tag);
          }}
          onRemoveTag={(tag) => {
            const activeImage =
              (snap.images.find(
                (i) => i.id === contextMenu.image.id,
              ) as ImageMeta) || contextMenu.image;
            void handleRemoveTag(activeImage, tag);
          }}
        />
      )}

      {tagColorPicker && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => setTagColorPicker(null)}
          />
          <div
            data-tag-color-picker="true"
            className="fixed z-[61] w-62 bg-neutral-900/95 border border-neutral-700/80 rounded-xl shadow-2xl p-3 backdrop-blur"
            style={{
              top: tagColorPicker.y,
              left: tagColorPicker.x,
              width: POPOVER_WIDTH,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <Tag
                tag={tagColorPicker.tag}
                className="truncate max-w-[150px]"
              />
              <button
                className="text-xs text-neutral-400 hover:text-white transition-colors"
                onClick={() => globalActions.clearTagColor(tagColorPicker.tag)}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ColorInput
                value={appSnap.tagColors[tagColorPicker.tag] || THEME.primary}
                onChange={(next) =>
                  globalActions.setTagColor(tagColorPicker.tag, next)
                }
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-200 font-semibold truncate">
                  {t("common.color")}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {appSnap.tagColors[tagColorPicker.tag] || t("common.notSet")}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-9 gap-1.5">
              {appSnap.colorSwatches.map((c, i) => {
                const current =
                  appSnap.tagColors[tagColorPicker.tag] || THEME.primary;
                return (
                  <Swatch
                    key={`${c}_${i}`}
                    color={c}
                    selected={c.toLowerCase() === current.toLowerCase()}
                    onPress={() =>
                      globalActions.setTagColor(tagColorPicker.tag, c)
                    }
                    onReplaceWithCurrent={() =>
                      globalActions.setColorSwatch(i, current)
                    }
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {dominantColorPicker && contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => {
              closeContextMenu();
              debouncedUpdateDominantColor.cancel();
              setDominantColorPicker(null);
            }}
          />
          <div
            className="fixed z-[61] w-62 bg-neutral-900/95 border border-neutral-700/80 rounded-xl shadow-2xl p-3 backdrop-blur"
            style={{
              top: dominantColorPicker.y,
              left: dominantColorPicker.x,
              width: POPOVER_WIDTH,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-200 font-semibold">
                {t("gallery.dominantColor.title")}
              </div>
              <button
                type="button"
                className="text-xs text-neutral-400 hover:text-white transition-colors"
                onClick={async () => {
                  debouncedUpdateDominantColor.cancel();
                  await handleUpdateDominantColor(contextMenu.image, null);
                  setDominantColorPicker(null);
                }}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ColorInput
                value={dominantColorPicker.draft}
                onChange={(next) => {
                  setDominantColorPicker({
                    ...dominantColorPicker,
                    draft: next,
                  });
                  debouncedUpdateDominantColor(
                    dominantColorPicker.imageId,
                    next,
                  );
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-200 font-semibold truncate">
                  {t("gallery.colorFilter.selected")}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {dominantColorPicker.draft}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-9 gap-1.5">
              {appSnap.colorSwatches.map((c, i) => (
                <Swatch
                  key={`${c}_${i}`}
                  color={c}
                  selected={
                    c.toLowerCase() === dominantColorPicker.draft.toLowerCase()
                  }
                  onPress={() => {
                    debouncedUpdateDominantColor.cancel();
                    setDominantColorPicker({
                      ...dominantColorPicker,
                      draft: c,
                    });
                    const image =
                      galleryState.images.find(
                        (img) => img.id === dominantColorPicker.imageId,
                      ) || contextMenu.image;
                    if (!image || image.id !== dominantColorPicker.imageId)
                      return;
                    void handleUpdateDominantColor(image as ImageMeta, c);
                  }}
                  onReplaceWithCurrent={() =>
                    globalActions.setColorSwatch(i, dominantColorPicker.draft)
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
