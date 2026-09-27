import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { useSnapshot } from "valtio";
import { getRuntimeWindowType } from "../config";
import { TitleBar } from "./components/TitleBar";
import { Gallery } from "./components/Gallery";
import { EnvInitModal } from "./components/EnvInitModal";
// import { WindowResizer } from "./components/WindowResizer";
import { GalleryPreviewWindow } from "./components/gallery/GalleryPreviewWindow";
import { actions as galleryActions, type ImageMeta } from "./store/galleryStore";
import {
  envInitActions,
  globalActions,
  globalState,
  type EnvInitState,
  type ToastType,
} from "./store/globalStore";
import { versionActions } from "./store/versionStore";
import { wallpaperActions } from "./store/wallpaperStore";
import type { WallpaperState } from "../shared/wallpaper";
import { importFiles } from "./utils/import";
import { useT } from "./i18n/useT";
import { isI18nKey } from "../shared/i18n/guards";
import { getClipboardImageFiles } from "./utils/clipboardImage";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toastToneByType: Record<ToastType, string> = {
  success: "border-emerald-700/60 bg-emerald-950/80 text-emerald-100",
  error: "border-red-700/60 bg-red-950/80 text-red-100",
  warning: "border-yellow-700/60 bg-yellow-950/80 text-yellow-100",
  info: "border-neutral-700/70 bg-neutral-900/90 text-neutral-100",
  loading:
    "border-[rgba(57,197,187,0.48)] bg-[rgba(14,54,52,0.92)] text-[#b9f3ef] hover:bg-[rgba(18,69,65,0.94)]",
};

function App() {
  const windowType = getRuntimeWindowType();
  const globalSnap = useSnapshot(globalState);
  const { t } = useT();
  const isPreviewWindow = windowType === "gallery-preview";
  const vectorWarmupToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void window.electron?.getEnvInitProgress?.().then((data) => {
      if (disposed) return;
      if (isRecord(data)) {
        envInitActions.update(data as Partial<EnvInitState>);
      }
    });
    void versionActions.init();

    const cleanupUpdate = window.electron?.onImageUpdated((data) => {
      if (isRecord(data) && typeof data.id === "string") {
        galleryActions.updateImage(data.id, data as Partial<ImageMeta>);
      }
    });

    const cleanupEnv = window.electron?.onEnvInitProgress((data) => {
      if (isRecord(data)) {
        envInitActions.update(data as Partial<EnvInitState>);
      }
    });

    const cleanupVectorService = window.electron?.onVectorServiceStatus?.(
      (data) => {
        if (!isRecord(data) || typeof data.isWarming !== "boolean") {
          return;
        }

        if (data.isWarming) {
          if (vectorWarmupToastIdRef.current === null) {
            vectorWarmupToastIdRef.current = globalActions.pushToast(
              { key: "toast.modelWarming" },
              "loading",
              0,
            );
          }
          return;
        }

        if (vectorWarmupToastIdRef.current !== null) {
          globalActions.removeToast(vectorWarmupToastIdRef.current);
          vectorWarmupToastIdRef.current = null;
        }
      },
    );

    const cleanupToast = window.electron?.onToast?.((data) => {
      if (!isRecord(data) || !isI18nKey(data.key)) return;
      const type =
        data.type === "success" ||
        data.type === "error" ||
        data.type === "warning" ||
          data.type === "info" ||
          data.type === "loading"
          ? (data.type as ToastType)
          : "info";
      const params = isRecord(data.params)
        ? (data.params as Record<string, string | number>)
        : undefined;
      globalActions.pushToast({ key: data.key, params }, type);
    });

    const cleanupWallpaper = window.electron?.onWallpaperState?.((data) => {
      if (isRecord(data) && typeof data.supported === "boolean") {
        wallpaperActions.sync(data as WallpaperState);
      }
    });

    const cleanupVisibility = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event === "app-visibility") {
          globalActions.setAppHidden(!(args[0] as boolean));
          return;
        }

        if (event === "window-always-on-top" && typeof args[0] === "boolean") {
          globalActions.syncWindowAlwaysOnTop(args[0]);
          return;
        }

        if (
          event === "gallery-preview-search-image" &&
          isRecord(args[0]) &&
          typeof args[0].imageId === "string" &&
          typeof args[0].previewUrl === "string" &&
          typeof args[0].previewName === "string"
        ) {
          galleryActions.setSearchImageSource({
            type: "library",
            imageId: args[0].imageId,
            previewUrl: args[0].previewUrl,
            previewName: args[0].previewName,
          });
        }
      },
    );

    return () => {
      disposed = true;
      cleanupUpdate?.();
      cleanupEnv?.();
      cleanupVectorService?.();
      if (vectorWarmupToastIdRef.current !== null) {
        globalActions.removeToast(vectorWarmupToastIdRef.current);
        vectorWarmupToastIdRef.current = null;
      }
      cleanupToast?.();
      cleanupWallpaper?.();
      cleanupVisibility?.();
    };
  }, []);

  useEffect(() => {
    if (isPreviewWindow) {
      return;
    }

    const handlePaste = async (event: ClipboardEvent) => {
      if (document.hidden) return;

      const files = getClipboardImageFiles(event.clipboardData);
      if (files.length === 0) return;

      event.preventDefault();
      await importFiles(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isPreviewWindow]);

  if (isPreviewWindow) {
    return (
      <div className="relative h-screen overflow-hidden bg-neutral-950 text-white">
        <GalleryPreviewWindow />
        {globalSnap.toasts.length > 0 && (
          <div className="fixed right-4 top-4 z-[9999] flex flex-col gap-2">
            {globalSnap.toasts.map((toast) => {
              return (
                <button
                  key={toast.id}
                  type="button"
                  className={clsx(
                    "rounded border text-left text-xs shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90",
                    "max-w-[320px] px-3 py-2",
                    toastToneByType[toast.type],
                  )}
                  onClick={() => globalActions.removeToast(toast.id)}
                >
                  {t(toast.message.key, toast.message.params)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "relative h-screen overflow-hidden bg-neutral-950 text-white",
        globalSnap.isAppHidden && "hidden",
      )}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* <WindowResizer /> */}
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <Gallery />
        </div>
      </div>

      <EnvInitModal />
      {globalSnap.toasts.length > 0 && (
        <div className="fixed right-4 top-14 z-[9999] flex flex-col gap-2 no-drag">
          {globalSnap.toasts.map((toast) => {
            return (
              <button
                key={toast.id}
                type="button"
                className={clsx(
                  "rounded border text-left text-xs shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90",
                  "max-w-[320px] px-3 py-2",
                  toastToneByType[toast.type],
                )}
                onClick={() => globalActions.removeToast(toast.id)}
              >
                {t(toast.message.key, toast.message.params)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;
