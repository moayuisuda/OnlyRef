import React, { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import {
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { useSnapshot } from "valtio";
import { deriveNameFromFilename, getImageUrl } from "../../store/galleryStore";
import {
  previewWindowActions,
  previewWindowState,
} from "../../store/previewWindowStore";
import { globalActions } from "../../store/globalStore";
import { openImageInFolder } from "../../service";
import { useT } from "../../i18n/useT";

type Size = {
  width: number;
  height: number;
};

const EMPTY_SIZE: Size = {
  width: 0,
  height: 0,
};

export const GalleryPreviewWindow: React.FC = () => {
  const snap = useSnapshot(previewWindowState);
  const { t } = useT();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<Size>(EMPTY_SIZE);
  const [loadedSizeMap, setLoadedSizeMap] = useState<Record<string, Size>>({});
  const [isPanning, setIsPanning] = useState(false);

  const activeIndex = snap.images.findIndex(
    (image) => image.id === snap.activeImageId,
  );
  const previewImages = snap.images;
  const currentImage = activeIndex >= 0 ? previewImages[activeIndex] : null;
  const currentImageUrl = currentImage ? getImageUrl(currentImage.imagePath) : "";
  const displayName = currentImage
    ? deriveNameFromFilename(currentImage.filename) ||
      t("gallery.searchImage.defaultName")
    : "";

  useEffect(() => {
    let disposed = false;

    const dataRequest = window.electron?.getGalleryPreviewData?.();
    if (dataRequest) {
      void dataRequest.then((payload) => {
        if (disposed) {
          return;
        }
        previewWindowActions.hydrate(payload ?? null);
      });
    }

    const cleanup = window.electron?.onRendererEvent?.((event, payload) => {
      if (event !== "gallery-preview-data") {
        return;
      }

      previewWindowActions.hydrate(
        payload as Parameters<typeof previewWindowActions.hydrate>[0],
      );
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!viewportRef.current) {
      return;
    }

    const element = viewportRef.current;
    const updateViewportSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateViewportSize();

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [currentImage?.id]);

  useEffect(() => {
    if (!currentImageUrl) {
      return;
    }

    let cancelled = false;
    const image = new window.Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      setLoadedSizeMap((current) => ({
        ...current,
        [currentImageUrl]: {
          width: image.naturalWidth,
          height: image.naturalHeight,
        },
      }));
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }

      setLoadedSizeMap((current) => ({
        ...current,
        [currentImageUrl]: EMPTY_SIZE,
      }));
    };

    image.src = currentImageUrl;

    return () => {
      cancelled = true;
    };
  }, [currentImageUrl]);

  const imageSize = useMemo(() => {
    if (!currentImageUrl) {
      return EMPTY_SIZE;
    }

    return loadedSizeMap[currentImageUrl] ?? EMPTY_SIZE;
  }, [currentImageUrl, loadedSizeMap]);

  useEffect(() => {
    const preloadTargets = [
      activeIndex > 0 ? previewImages[activeIndex - 1] : null,
      activeIndex < previewImages.length - 1 ? previewImages[activeIndex + 1] : null,
    ].filter((image): image is (typeof previewImages)[number] => Boolean(image));

    preloadTargets.forEach((image) => {
      const imageUrl = getImageUrl(image.imagePath);
      if (loadedSizeMap[imageUrl]) {
        return;
      }

      const preloadImage = new window.Image();
      preloadImage.onload = () => {
        setLoadedSizeMap((current) => {
          if (current[imageUrl]) {
            return current;
          }

          return {
            ...current,
            [imageUrl]: {
              width: preloadImage.naturalWidth,
              height: preloadImage.naturalHeight,
            },
          };
        });
      };
      preloadImage.src = imageUrl;
    });
  }, [activeIndex, loadedSizeMap, previewImages]);

  const containScale = useMemo(() => {
    if (
      viewportSize.width <= 0 ||
      viewportSize.height <= 0 ||
      imageSize.width <= 0 ||
      imageSize.height <= 0
    ) {
      return 1;
    }

    return Math.min(
      viewportSize.width / imageSize.width,
      viewportSize.height / imageSize.height,
      1,
    );
  }, [imageSize, viewportSize]);

  const minScale = Math.max(containScale * 0.9, 0.05);
  const isImageReady =
    viewportSize.width > 0 &&
    viewportSize.height > 0 &&
    imageSize.width > 0 &&
    imageSize.height > 0;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < snap.images.length - 1;
  const transformKey = [
    currentImage?.id ?? "empty",
    containScale.toFixed(4),
    imageSize.width,
    imageSize.height,
    viewportSize.width,
    viewportSize.height,
  ].join("_");

  useEffect(() => {
    if (!currentImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        previewWindowActions.setActiveImage(previewImages[activeIndex - 1].id);
        return;
      }

      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        previewWindowActions.setActiveImage(previewImages[activeIndex + 1].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeIndex, currentImage, hasNext, hasPrevious, previewImages]);

  if (!snap.hydrated || !currentImage) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        {t("common.loading")}
      </div>
    );
  }

  const handleSearchByImage = async () => {
    await window.electron?.searchMainWindowByImage?.({
      imageId: currentImage.id,
      previewUrl: currentImageUrl,
      previewName:
        deriveNameFromFilename(currentImage.filename) ||
        t("gallery.searchImage.defaultName"),
    });
  };

  const handleShowInFolder = async () => {
    try {
      await openImageInFolder(currentImage.id);
    } catch (error) {
      console.error(error);
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-neutral-950 text-white">
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(57,197,187,0.14),transparent_28%),linear-gradient(180deg,rgba(12,12,12,1),rgba(5,5,5,1))]">
        <div className="draggable absolute inset-x-0 top-0 z-10 h-16" />

        <div className="draggable absolute right-4 top-4 z-30">
          <div className="flex items-center gap-1.5 rounded-full border border-white/12 bg-black/36 px-2 py-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[10px] leading-none text-white/62">
              {activeIndex + 1} / {snap.images.length}
            </div>

            <button
              type="button"
              className="no-drag flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-white/78 transition-all hover:border-[rgba(57,197,187,0.32)] hover:bg-[rgba(57,197,187,0.14)] hover:text-white"
              onClick={() => {
                void handleSearchByImage();
              }}
              title={t("gallery.contextMenu.searchByImage")}
              aria-label={t("gallery.contextMenu.searchByImage")}
            >
              <Search size={12} />
            </button>

            <button
              type="button"
              className="no-drag flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-white/78 transition-all hover:border-white/14 hover:bg-white/10 hover:text-white"
              onClick={() => {
                void handleShowInFolder();
              }}
              title={t("gallery.contextMenu.showInFolder")}
              aria-label={t("gallery.contextMenu.showInFolder")}
            >
              <FolderOpen size={12} />
            </button>

            <button
              type="button"
              className="no-drag flex h-7 w-7 items-center justify-center rounded-full border border-red-400/24 bg-red-500/18 text-red-200 transition-all hover:border-red-400/36 hover:bg-red-500/28 hover:text-red-100"
              onClick={() => window.electron?.closeCurrentWindow?.()}
              title={t("common.close")}
              aria-label={t("common.close")}
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <button
          type="button"
          className={clsx(
            "absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/34 text-white shadow-lg backdrop-blur-md transition-all",
            hasPrevious
              ? "opacity-100 hover:bg-black/54"
              : "cursor-not-allowed opacity-30",
          )}
          onClick={() => {
            if (!hasPrevious) {
              return;
            }
            previewWindowActions.setActiveImage(previewImages[activeIndex - 1].id);
          }}
          disabled={!hasPrevious}
          title={t("gallery.preview.previous")}
          aria-label={t("gallery.preview.previous")}
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          className={clsx(
            "absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/34 text-white shadow-lg backdrop-blur-md transition-all",
            hasNext
              ? "opacity-100 hover:bg-black/54"
              : "cursor-not-allowed opacity-30",
          )}
          onClick={() => {
            if (!hasNext) {
              return;
            }
            previewWindowActions.setActiveImage(previewImages[activeIndex + 1].id);
          }}
          disabled={!hasNext}
          title={t("gallery.preview.next")}
          aria-label={t("gallery.preview.next")}
        >
          <ChevronRight size={18} />
        </button>

        <div ref={viewportRef} className="absolute inset-0 overflow-hidden">
          {isImageReady ? (
            <TransformWrapper
              key={transformKey}
              initialScale={containScale}
              minScale={minScale}
              maxScale={6}
              centerOnInit
              centerZoomedOut
              limitToBounds
              smooth={false}
              doubleClick={{
                mode: "toggle",
                step: 1.5,
                animationTime: 180,
              }}
              wheel={{
                step: 0.05,
                wheelDisabled: false,
                touchPadDisabled: false,
              }}
              pinch={{
                step: 2,
              }}
              panning={{
                disabled: false,
                velocityDisabled: true,
                allowLeftClickPan: true,
                allowMiddleClickPan: false,
                allowRightClickPan: false,
              }}
              onPanningStart={() => setIsPanning(true)}
              onPanningStop={() => setIsPanning(false)}
            >
              <TransformComponent
                wrapperStyle={{
                  width: "100%",
                  height: "100%",
                  cursor: isPanning ? "grabbing" : "grab",
                }}
                contentStyle={{
                  width: imageSize.width,
                  height: imageSize.height,
                }}
              >
                <img
                  src={currentImageUrl}
                  alt={displayName}
                  draggable={false}
                  className="select-none"
                  style={{
                    display: "block",
                    width: imageSize.width,
                    height: imageSize.height,
                    maxWidth: "none",
                    maxHeight: "none",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-9 w-9 rounded-full border border-white/10 border-t-[var(--color-primary)]/80 bg-black/18" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
