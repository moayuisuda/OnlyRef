import { useEffect } from "react";
import { clsx } from "clsx";
import { useSnapshot } from "valtio";
import { TitleBar } from "./components/TitleBar";
import { Gallery } from "./components/Gallery";
import { EnvInitModal } from "./components/EnvInitModal";
import { WindowResizer } from "./components/WindowResizer";
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
        "app-shell relative flex h-screen flex-col overflow-hidden text-white",
        globalSnap.isAppHidden && "hidden",
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <WindowResizer />
      <TitleBar />
      <EnvInitModal />
      {globalSnap.toasts.length > 0 && (
        <div className="fixed right-5 top-16 z-[9999] flex flex-col gap-2.5 no-drag">
          {globalSnap.toasts.map((toast) => {
            const tone =
              toast.type === "success"
                ? "border-emerald-300/20 bg-[rgba(21,53,47,0.92)] text-emerald-50"
                : toast.type === "error"
                  ? "border-red-300/20 bg-[rgba(62,28,28,0.92)] text-red-50"
                  : toast.type === "warning"
                    ? "border-amber-300/20 bg-[rgba(69,50,24,0.92)] text-amber-50"
                    : "border-white/10 bg-[rgba(22,26,29,0.92)] text-neutral-100";

            return (
              <button
                key={toast.id}
                type="button"
                className={`surface-panel max-w-[340px] rounded-2xl px-3.5 py-3 text-left text-xs leading-5 transition-transform duration-200 hover:-translate-y-0.5 ${tone}`}
                onClick={() => globalActions.removeToast(toast.id)}
              >
                {t(toast.message.key, toast.message.params)}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative z-10 flex-1 overflow-hidden">
        <Gallery />
      </div>
    </div>
  );
}

export default App;
