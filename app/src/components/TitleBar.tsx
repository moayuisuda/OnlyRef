import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Minus, RefreshCw, Settings, Square, X } from "lucide-react";
import { clsx } from "clsx";
import { useSnapshot } from "valtio";
import { useT } from "../i18n/useT";
import {
  globalActions,
  globalState,
  indexingActions,
  indexingState,
  modelProgressActions,
  modelProgressState,
} from "../store/globalStore";
import { actions as galleryActions, state as galleryState } from "../store/galleryStore";
import { indexImages } from "../service";
import { useClickOutside } from "../hooks/useClickOutside";
import { ToggleSwitch } from "./ToggleSwitch";
import { ShortcutInput } from "./ShortcutInput";
import type { I18nKey, I18nParams } from "../../shared/i18n/types";
import { isI18nKey } from "../../shared/i18n/guards";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const SettingInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}> = ({ value, onChange, type = "text", placeholder }) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) {
          onChange(draft);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
};

export const TitleBar: React.FC = () => {
  const snap = useSnapshot(globalState);
  const gallerySnap = useSnapshot(galleryState);
  const indexingSnap = useSnapshot(indexingState);
  const modelSnap = useSnapshot(modelProgressState);
  const { t } = useT();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageDir, setStorageDir] = useState("");
  const [loadingStorageDir, setLoadingStorageDir] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);

  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  useClickOutside<HTMLElement>([settingsButtonRef, settingsPanelRef], () => {
    setSettingsOpen(false);
  });

  useEffect(() => {
    window.electron?.setSettingsOpen?.(settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    const cleanupModel = window.electron?.onModelDownloadProgress?.((data) => {
      if (!isRecord(data)) return;

      if (data.isOpen === false) {
        modelProgressActions.reset();
        return;
      }

      if (typeof data.progress === "number" && isI18nKey(data.statusKey)) {
        modelProgressActions.update({
          isDownloading: true,
          current: Math.round(Math.max(0, Math.min(1, data.progress)) * 100),
          total: 100,
          statusKey: data.statusKey as I18nKey,
          statusParams: isRecord(data.statusParams)
            ? (data.statusParams as I18nParams)
            : undefined,
          filename: typeof data.filename === "string" ? data.filename : undefined,
        });
      }
    });

    const cleanupIndexing = window.electron?.onIndexingProgress?.((data) => {
      if (!isRecord(data)) return;

      indexingActions.update({
        isIndexing: true,
        current: typeof data.current === "number" ? data.current : 0,
        total: typeof data.total === "number" ? data.total : 0,
        statusKey: isI18nKey(data.statusKey) ? (data.statusKey as I18nKey) : null,
        statusParams: isRecord(data.statusParams)
          ? (data.statusParams as I18nParams)
          : undefined,
        filename: typeof data.filename === "string" ? data.filename : undefined,
      });
    });

    return () => {
      cleanupModel?.();
      cleanupIndexing?.();
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen || !window.electron?.getStorageDir) return;

    setLoadingStorageDir(true);
    void window.electron
      .getStorageDir()
      .then((dir) => setStorageDir(dir))
      .finally(() => setLoadingStorageDir(false));
  }, [settingsOpen]);

  const handleToggleVectorSearch = async (enabled: boolean) => {
    const previous = snap.enableVectorSearch;
    globalActions.setEnableVectorSearch(enabled);

    if (!enabled) return;

    const result = await window.electron?.ensureModelReady?.();
    if (result && result.success !== true) {
      globalActions.setEnableVectorSearch(previous);
      globalActions.pushToast(
        { key: "toast.ensureModelFailed", params: { error: result.error ?? "" } },
        "error",
      );
      return;
    }

    globalActions.pushToast({ key: "toast.modelReady" }, "success");
  };

  const handleChooseStorageDir = async () => {
    if (!window.electron?.chooseStorageDir) return;
    await window.electron.chooseStorageDir();
  };

  const handleIndexMissingImages = async () => {
    setIsIndexing(true);
    indexingActions.update({
      isIndexing: true,
      current: 0,
      total: 0,
      statusKey: "indexing.starting",
    });

    try {
      const data = await indexImages<{
        success?: boolean;
        created?: number;
        updated?: number;
      }>({
        mode: "missing",
      });

      if (!data?.success) {
        globalActions.pushToast({ key: "toast.indexFailed" }, "error");
        return;
      }

      galleryActions.reload();

      if (!data.created && !data.updated) {
        globalActions.pushToast({ key: "toast.noUnindexedImages" }, "info");
        return;
      }

      globalActions.pushToast(
        {
          key: "toast.indexCompleted",
          params: {
            created: data.created ?? 0,
            updated: data.updated ?? 0,
          },
        },
        "success",
      );
    } catch (error) {
      console.error(error);
      globalActions.pushToast({ key: "toast.indexFailed" }, "error");
    } finally {
      setIsIndexing(false);
      window.setTimeout(() => {
        indexingActions.reset();
      }, 800);
    }
  };

  const handleToggleWindowShortcut = async (accelerator: string) => {
    if (!accelerator.trim()) {
      globalActions.pushToast({ key: "toast.shortcutInvalid" }, "error");
      return;
    }
    await globalActions.setToggleWindowShortcut(accelerator);
  };

  const progressText =
    indexingSnap.isIndexing && indexingSnap.statusKey
      ? t(indexingSnap.statusKey, indexingSnap.statusParams)
      : modelSnap.isDownloading && modelSnap.statusKey
        ? t(modelSnap.statusKey, modelSnap.statusParams)
        : null;

  return (
    <div className="draggable relative z-30 border-b border-neutral-800 bg-neutral-900/95 backdrop-blur">
      <div className="flex h-10 items-center gap-3 px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">OnlyRef</div>
          <div className="truncate text-[11px] text-neutral-400">
            {gallerySnap.images.length} images
            {progressText ? ` · ${progressText}` : " · Drop or paste images to import"}
          </div>
        </div>

        <div className="no-drag flex items-center gap-2">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            title="Refresh gallery"
            onClick={() => galleryActions.reload()}
          >
            <RefreshCw size={14} />
          </button>
          <button
            ref={settingsButtonRef}
            type="button"
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded border bg-neutral-900 transition-colors",
              settingsOpen
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white",
            )}
            title="Settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            title="Minimize"
            onClick={() => window.electron?.min()}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            title="Maximize"
            onClick={() => window.electron?.max()}
          >
            <Square size={13} />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-red-900/60 bg-red-950/40 text-red-200 transition-colors hover:border-red-700 hover:bg-red-900/60"
            title="Close"
            onClick={() => window.electron?.close()}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="no-drag absolute right-3 top-[calc(100%+0.5rem)] z-40 w-[420px] rounded-lg border border-neutral-800 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur"
        >
          <div className="mb-3">
            <div className="text-sm font-medium text-white">Settings</div>
            <div className="text-xs text-neutral-400">Library, search, and indexing.</div>
          </div>

          <div className="space-y-3">
            <section className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="mb-2 text-xs font-medium text-neutral-500">
                Library
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 text-sm text-neutral-300">Storage folder</div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400 break-all">
                    {loadingStorageDir ? "Loading..." : storageDir || "Unavailable"}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white transition-colors hover:border-neutral-500"
                  onClick={handleChooseStorageDir}
                >
                  <FolderOpen size={14} />
                  Change folder
                </button>
              </div>
            </section>

            <section className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="mb-2 text-xs font-medium text-neutral-500">
                Search
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-200">Semantic search</div>
                  <div className="text-xs text-neutral-400">
                    Enable vector indexing and similarity search.
                  </div>
                </div>
                <ToggleSwitch
                  checked={snap.enableVectorSearch}
                  onChange={handleToggleVectorSearch}
                />
              </div>
            </section>

            <section className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="mb-2 text-xs font-medium text-neutral-500">
                Indexing
              </div>
              {(indexingSnap.isIndexing || modelSnap.isDownloading) && (
                <div className="mb-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white">
                    <span>{progressText}</span>
                    <span className="text-xs text-neutral-400">
                      {indexingSnap.isIndexing && indexingSnap.total > 0
                        ? `${Math.round((indexingSnap.current / indexingSnap.total) * 100)}%`
                        : modelSnap.isDownloading
                          ? `${modelSnap.current}%`
                          : ""}
                    </span>
                  </div>
                  {(indexingSnap.isIndexing || modelSnap.isDownloading) && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                        style={{
                          width: `${
                            indexingSnap.isIndexing && indexingSnap.total > 0
                              ? (indexingSnap.current / indexingSnap.total) * 100
                              : modelSnap.current
                          }%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white transition-colors hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleIndexMissingImages}
                disabled={isIndexing}
              >
                <RefreshCw size={14} className={clsx(isIndexing && "animate-spin")} />
                {isIndexing ? "Indexing..." : "Index missing images"}
              </button>
            </section>

            <section className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
              <div className="mb-2 text-xs font-medium text-neutral-500">
                Window
              </div>
              <div className="space-y-2">
                <div className="text-sm text-neutral-200">Toggle window shortcut</div>
                <ShortcutInput
                  value={snap.toggleWindowShortcut}
                  onChange={(value) => {
                    void handleToggleWindowShortcut(value);
                  }}
                />
              </div>
            </section>

            {snap.enableVectorSearch && (
              <section className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
                <div className="mb-2 text-xs font-medium text-neutral-500">
                  Query Translation
                </div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-neutral-200">Use LLM translation</div>
                    <div className="text-xs text-neutral-400">
                      Translate natural-language queries before vector search.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={snap.llmSettings.enabled}
                    onChange={(checked) => globalActions.setLlmSettings({ enabled: checked })}
                  />
                </div>
                {snap.llmSettings.enabled && (
                  <div className="space-y-2">
                    <SettingInput
                      value={snap.llmSettings.baseUrl}
                      placeholder="Base URL"
                      onChange={(value) => globalActions.setLlmSettings({ baseUrl: value })}
                    />
                    <SettingInput
                      value={snap.llmSettings.key}
                      placeholder="API key"
                      type="password"
                      onChange={(value) => globalActions.setLlmSettings({ key: value })}
                    />
                    <SettingInput
                      value={snap.llmSettings.model}
                      placeholder="Model"
                      onChange={(value) => globalActions.setLlmSettings({ model: value })}
                    />
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
