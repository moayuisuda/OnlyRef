import { useEffect, useRef } from "react";
import { TitleBar } from "./components/TitleBar";
import { Gallery } from "./components/Gallery";
import { Canvas } from "./components/Canvas";
import { EnvInitModal } from "./components/EnvInitModal";
import {
  actions as galleryActions,
} from "./store/galleryStore";
import { THEME } from "./theme";
import {
  globalActions,
  globalState,
  envInitActions,
  type EnvInitState,
  type ToastType,
} from "./store/globalStore";
import type { ImageMeta } from "./store/galleryStore";
import { canvasActions, canvasState } from "./store/canvasStore";
import { anchorActions } from "./store/anchorStore";
import { useSnapshot } from "valtio";
import { clsx } from "clsx";

import { createTempMetasFromFiles, importFiles } from "./utils/import";
import { useT } from "./i18n/useT";
import { isI18nKey } from "../shared/i18n/guards";
import { useAppShortcuts } from "./hooks/useAppShortcuts";

import { WindowResizer } from "./components/WindowResizer";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function App() {
  useAppShortcuts();
  const globalSnap = useSnapshot(globalState);
  const isResizingRef = useRef(false);
  const { t } = useT();
  const showGallery = globalSnap.isGalleryOpen && !globalSnap.mouseThrough;
  const galleryTransform = showGallery
    ? "translate3d(0,0,0)"
    : "translate3d(-100%,0,0)";

  // Removed useEffect for pinMode resizeWindowBy as it is now handled atomically in TitleBar

  useEffect(() => {
    // 监听更新 (例如向量生成完毕)
    const cleanupUpdate = window.electron?.onImageUpdated((data) => {
      console.log("Image update received:", data);
      if (isRecord(data) && typeof data.id === "string") {
        galleryActions.updateImage(data.id, data as Partial<ImageMeta>);
      }
    });

    // 监听环境初始化进度 (UV/Python) -> 模态框
    console.log('mount')
    const cleanupEnv = window.electron?.onEnvInitProgress((data) => {
      console.log("Env init progress received:", data);
      
      if (isRecord(data)) {
        envInitActions.update(data as unknown as Partial<EnvInitState>);
      }
    });

    // 监听 Toast 消息
    const cleanupToast = window.electron?.onToast?.((data) => {
      if (!isRecord(data)) return;
      if (!isI18nKey(data.key)) return;
      const type =
        data.type === "success" ||
        data.type === "error" ||
        data.type === "warning" ||
        data.type === "info"
          ? (data.type as ToastType)
          : "info";
      const params = isRecord(data.params)
        ? (data.params as Record<string, string | number>)
        : undefined;
      globalActions.pushToast({ key: data.key, params }, type);
    });
    
    // 初始化加载
    anchorActions.loadAnchors();

    const cleanupVisibility = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event === "app-visibility") {
          const visible = args[0] as boolean;
          globalActions.setAppHidden(!visible);
        }
      }
    );

    return () => {
      cleanupUpdate?.();
      cleanupEnv?.();
      cleanupToast?.();
      cleanupVisibility?.();
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(
        200,
        Math.min(e.clientX, document.body.clientWidth - 200),
      );
      globalActions.setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        globalActions.persistSidebarWidth();
      }
      isResizingRef.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (document.hidden) return;
      // 1. Try to get files directly (works for Finder files and most screenshots)
      let files = Array.from(e.clipboardData?.files || []);

      // 2. If no files found, check items (some browsers/OS might put image data here without populating files)
      if (files.length === 0 && e.clipboardData?.items) {
        const items = Array.from(e.clipboardData.items);
        files = items
          .filter((item) => item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((f): f is File => f !== null);
      }

      if (files.length > 0) {
        e.preventDefault();

        if (globalState.isGalleryOpen) {
          await importFiles(files);
          return;
        }

        const { canvasViewport, dimensions } = canvasState;
        const width = dimensions.width || canvasViewport.width;
        const height = dimensions.height || canvasViewport.height;
        const scale = canvasViewport.scale || 1;
        const hasViewport =
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0 &&
          Number.isFinite(canvasViewport.x) &&
          Number.isFinite(canvasViewport.y) &&
          Number.isFinite(scale) &&
          scale > 0;
        const center = hasViewport
          ? {
              x: (width / 2 - canvasViewport.x) / scale,
              y: (height / 2 - canvasViewport.y) / scale,
            }
          : null;

        const metas = await createTempMetasFromFiles(files);
        metas.forEach((meta, index) => {
          if (!center) {
            canvasActions.addToCanvas(meta);
            return;
          }
          const offset = index * 24;
          canvasActions.addToCanvas(meta, center.x + offset, center.y + offset);
        });
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <div
      className={clsx(
        "relative flex flex-col h-screen text-white overflow-hidden transition-colors",
        globalSnap.mouseThrough ? "bg-transparent" : "bg-neutral-950/85",
        globalSnap.isAppHidden && "hidden"
      )}
    >
      <WindowResizer />
      <TitleBar />
      <EnvInitModal />
      {globalSnap.toasts.length > 0 && (
        <div className="fixed right-4 top-10 z-[9999] flex flex-col gap-2 no-drag">
          {globalSnap.toasts.map((toast) => {
            const tone =
              toast.type === "success"
                ? "border-emerald-700/60 bg-emerald-950/80 text-emerald-100"
                : toast.type === "error"
                  ? "border-red-700/60 bg-red-950/80 text-red-100"
                  : toast.type === "warning"
                    ? "border-yellow-700/60 bg-yellow-950/80 text-yellow-100"
                    : "border-neutral-700/70 bg-neutral-900/90 text-neutral-100";
            return (
              <button
                key={toast.id}
                type="button"
                className={`max-w-[320px] rounded border px-3 py-2 text-left text-xs shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90 ${tone}`}
                onClick={() => globalActions.removeToast(toast.id)}
              >
                {t(toast.message.key, toast.message.params)}
              </button>
            );
          })}
        </div>
      )}
      <div
        className={clsx(
          "relative flex flex-1 overflow-hidden transition-colors duration-300",
        )}
      >
        <div
          className={clsx(
            "absolute top-0 left-0 bottom-0 z-20 flex h-full transition-transform duration-300 ease-in-out",
          )}
          style={{ transform: galleryTransform, willChange: "transform" }}
        >
          <Gallery />
          <div
            className="w-1 bg-neutral-800/50 hover:bg-[var(--resize-hover)] cursor-col-resize transition-colors"
            style={{ "--resize-hover": THEME.primary } as React.CSSProperties}
            onMouseDown={(e) => {
              e.preventDefault();
              isResizingRef.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
          />
        </div>
        <div className="flex-1 w-full h-full">
          <Canvas />
        </div>
      </div>
    </div>
  );
}

export default App;
