import { useEffect } from "react";
import { clsx } from "clsx";
import { useSnapshot } from "valtio";
import { TitleBar } from "./components/TitleBar";
import { Gallery } from "./components/Gallery";
import { EnvInitModal } from "./components/EnvInitModal";
import { WindowResizer } from "./components/WindowResizer";
import { FloatingOrb } from "./components/FloatingOrb";
import { actions as galleryActions, type ImageMeta } from "./store/galleryStore";
import {
  envInitActions,
  globalActions,
  globalState,
  type EnvInitState,
  type ToastType,
} from "./store/globalStore";
import { importFiles } from "./utils/import";
import { useT } from "./i18n/useT";
import { isI18nKey } from "../shared/i18n/guards";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function App() {
  const globalSnap = useSnapshot(globalState);
  const { t } = useT();

  useEffect(() => {
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

    const cleanupToast = window.electron?.onToast?.((data) => {
      if (!isRecord(data) || !isI18nKey(data.key)) return;
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

    const cleanupVisibility = window.electron?.onRendererEvent?.(
      (event: string, ...args: unknown[]) => {
        if (event === "app-visibility") {
          globalActions.setAppHidden(!(args[0] as boolean));
        }
      },
    );

    return () => {
      cleanupUpdate?.();
      cleanupEnv?.();
      cleanupToast?.();
      cleanupVisibility?.();
    };
  }, []);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (document.hidden) return;

      let files = Array.from(event.clipboardData?.files || []);
      if (files.length === 0 && event.clipboardData?.items) {
        files = Array.from(event.clipboardData.items)
          .filter((item) => item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
      }

      if (files.length === 0) return;

      event.preventDefault();
      await importFiles(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <div
      className={clsx(
        globalSnap.floatingWindowMode
          ? "relative h-screen overflow-hidden bg-neutral-950 text-white"
          : "relative flex h-screen flex-col overflow-hidden bg-neutral-950 text-white",
        globalSnap.isAppHidden && "hidden",
      )}
    >
      {!globalSnap.floatingWindowMode && <WindowResizer />}
      {!globalSnap.floatingWindowMode && <TitleBar />}
      <EnvInitModal />
      {globalSnap.toasts.length > 0 && (
        <div
          className={clsx(
            "fixed z-[9999] flex flex-col gap-2 no-drag",
            globalSnap.floatingWindowMode
              ? "bottom-2 left-1/2 w-[92px] -translate-x-1/2"
              : "right-4 top-14",
          )}
        >
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
                className={clsx(
                  "rounded border text-left text-xs shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90",
                  globalSnap.floatingWindowMode
                    ? "w-full px-2 py-1.5 text-[10px]"
                    : "max-w-[320px] px-3 py-2",
                  tone,
                )}
                onClick={() => globalActions.removeToast(toast.id)}
              >
                {t(toast.message.key, toast.message.params)}
              </button>
            );
          })}
        </div>
      )}
      {globalSnap.floatingWindowMode ? (
        <FloatingOrb />
      ) : (
        <div className="flex-1 overflow-hidden">
          <Gallery />
        </div>
      )}
    </div>
  );
}

export default App;
