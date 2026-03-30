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
      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-[var(--color-primary)]"
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
        { key: "toast.modelCheckFailed", params: { error: result.error ?? "" } },
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

  const progressPercent =
    indexingSnap.isIndexing && indexingSnap.total > 0
      ? Math.round((indexingSnap.current / indexingSnap.total) * 100)
      : modelSnap.isDownloading
        ? modelSnap.current
        : 0;

  return (
    <div className="draggable relative z-30 border-b border-white/8 bg-[rgba(18,22,24,0.78)] backdrop-blur-xl">
      <div className="flex min-h-14 items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.24em] text-neutral-500">
            <span className="font-medium text-neutral-400">Studio Library</span>
            <span className="h-px w-8 bg-white/8" />
            <span>{gallerySnap.images.length} images</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-300">
            <span className="font-[var(--font-display)] text-[1.05rem] tracking-[0.03em] text-neutral-100">
              OnlyRef
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              Local-first
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-neutral-500">
            {progressText ?? "Drop or paste images to import"}
          </div>
        </div>

        {(indexingSnap.isIndexing || modelSnap.isDownloading) && (
          <div className="no-drag hidden min-w-[160px] rounded-2xl border border-[rgba(57,197,187,0.14)] bg-[rgba(57,197,187,0.08)] px-3 py-2 md:block">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-[#bdeee8]">
              <span>Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/20">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="no-drag flex items-center gap-1.5">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-neutral-400 transition-all hover:-translate-y-px hover:border-white/14 hover:bg-white/[0.06] hover:text-white"
            title="Refresh gallery"
            onClick={() => galleryActions.reload()}
          >
            <RefreshCw size={14} />
          </button>
          <button
            ref={settingsButtonRef}
            type="button"
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-all",
              settingsOpen
                ? "border-[rgba(57,197,187,0.24)] bg-[rgba(57,197,187,0.14)] text-[var(--color-primary)]"
                : "border-white/8 bg-white/[0.03] text-neutral-400 hover:-translate-y-px hover:border-white/14 hover:bg-white/[0.06] hover:text-white",
            )}
            title="Settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-neutral-400 transition-all hover:-translate-y-px hover:border-white/14 hover:bg-white/[0.06] hover:text-white"
            title="Minimize"
            onClick={() => window.electron?.min()}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-neutral-400 transition-all hover:-translate-y-px hover:border-white/14 hover:bg-white/[0.06] hover:text-white"
            title="Maximize"
            onClick={() => window.electron?.max()}
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-neutral-400 transition-all hover:-translate-y-px hover:border-red-300/12 hover:bg-red-400/12 hover:text-red-100"
            title="Close"
            onClick={() => window.electron?.close()}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="surface-panel-strong no-drag absolute right-3 top-[calc(100%+0.75rem)] z-40 w-[440px] rounded-[1.5rem] p-4"
        >
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
              Settings
            </div>
            <div className="mt-1 font-[var(--font-display)] text-xl text-white">
              Workspace Controls
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              Library, search, indexing, and translation.
            </div>
          </div>

          <div className="space-y-3.5">
            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
                Library
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-sm text-neutral-300">Storage folder</div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3.5 py-3 text-xs break-all text-neutral-400">
                    {loadingStorageDir ? "Loading..." : storageDir || "Unavailable"}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-white transition-all hover:-translate-y-px hover:border-white/16 hover:bg-white/[0.07]"
                  onClick={handleChooseStorageDir}
                >
                  <FolderOpen size={14} />
                  Change folder
                </button>
              </div>
            </section>

            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
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

            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
                Indexing
              </div>
              {(indexingSnap.isIndexing || modelSnap.isDownloading) && (
                <div className="mb-3 rounded-2xl border border-[rgba(57,197,187,0.14)] bg-[rgba(57,197,187,0.08)] p-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white">
                    <span>{progressText}</span>
                    <span className="text-xs text-[#bdeee8]">
                      {progressPercent}%
                    </span>
                  </div>
                  {(indexingSnap.isIndexing || modelSnap.isDownloading) && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/20">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-white transition-all hover:-translate-y-px hover:border-white/16 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleIndexMissingImages}
                disabled={isIndexing}
              >
                <RefreshCw size={14} className={clsx(isIndexing && "animate-spin")} />
                {isIndexing ? "Indexing..." : "Index missing images"}
              </button>
            </section>

            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
                Window
              </div>
              <div className="space-y-2">
                <div className="text-sm text-neutral-200">Toggle window shortcut</div>
                <ShortcutInput
                  value={snap.toggleWindowShortcut}
                  onChange={(value) => {
                    void handleToggleWindowShortcut(value);
                  }}
                  onInvalid={() => {
                    globalActions.pushToast({ key: "toast.shortcutInvalid" }, "error");
                  }}
                />
              </div>
            </section>

            {snap.enableVectorSearch && (
              <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
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
