import React, { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Minus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
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

const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-neutral-400 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white";

const windowButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-all hover:bg-white/[0.08] hover:text-white";

const panelSectionClass =
  "rounded-2xl border border-white/8 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type SettingInputProps = {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
};

const SettingInput: React.FC<SettingInputProps> = ({
  value,
  onChange,
  type = "text",
  placeholder,
}) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
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

type StatusBadgeTone = "idle" | "accent" | "progress";

const StatusBadge: React.FC<{
  label: string;
  tone: StatusBadgeTone;
}> = ({ label, tone }) => (
  <span
    className={clsx(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]",
      tone === "progress" && "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
      tone === "accent" && "bg-white/8 text-neutral-200",
      tone === "idle" && "bg-white/[0.04] text-neutral-500",
    )}
  >
    {label}
  </span>
);

const ProgressBar: React.FC<{
  value: number;
  active?: boolean;
}> = ({ value, active = true }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
    <div
      className={clsx(
        "h-full rounded-full transition-all duration-300",
        active
          ? "bg-[linear-gradient(90deg,rgba(57,197,187,0.45),rgba(57,197,187,1))]"
          : "bg-white/[0.14]",
      )}
      style={{ width: `${Math.max(6, Math.min(100, value))}%` }}
    />
  </div>
);

const SettingsSection: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className={panelSectionClass}>
    <div className="mb-3">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs text-neutral-400">{description}</div>
    </div>
    {children}
  </section>
);

const MetricCard: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
    <div className="mt-1 text-sm font-medium text-neutral-100">{value}</div>
  </div>
);

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
    const nextDir = await window.electron.chooseStorageDir();
    if (typeof nextDir === "string" && nextDir.trim()) {
      setStorageDir(nextDir);
    }
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

  const statusMeta = indexingSnap.isIndexing
    ? {
        badge: "Indexing",
        tone: "progress" as const,
        title: progressText ?? "Preparing library update",
        detail:
          indexingSnap.filename ||
          "Refreshing your local reference library and metadata.",
        percent:
          indexingSnap.total > 0
            ? Math.round((indexingSnap.current / indexingSnap.total) * 100)
            : 12,
      }
    : modelSnap.isDownloading
      ? {
          badge: "Model",
          tone: "progress" as const,
          title: progressText ?? "Preparing semantic search",
          detail:
            modelSnap.filename || "Downloading the search model for semantic retrieval.",
          percent: Math.max(8, modelSnap.current || 8),
        }
      : {
          badge: snap.enableVectorSearch ? "Semantic" : "Ready",
          tone: snap.enableVectorSearch ? ("accent" as const) : ("idle" as const),
          title: "Drop or paste images to import",
          detail: snap.enableVectorSearch
            ? snap.llmSettings.enabled
              ? "Semantic search and query translation are active."
              : "Semantic search is active for your local library."
            : "Search, color filtering, and local library management are ready.",
          percent: 100,
        };

  const imageCount = gallerySnap.images.length;
  const imageCountLabel = `${imageCount} ${imageCount === 1 ? "image" : "images"}`;
  const searchModeLabel = snap.enableVectorSearch ? "Semantic search" : "Keyword search";

  return (
    <div className="draggable relative z-30 border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(57,197,187,0.18),transparent_34%),linear-gradient(180deg,rgba(20,20,20,0.98),rgba(10,10,10,0.98))]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04),transparent_26%,transparent_74%,rgba(255,255,255,0.03))]" />

      <div className="relative flex h-14 items-center gap-3 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(57,197,187,0.28),rgba(255,255,255,0.03))]">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_16px_rgba(57,197,187,0.9)]" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-neutral-500">
                Reference Library
              </div>
              <div className="text-sm font-semibold text-white">OnlyRef</div>
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <div className="min-w-[180px] rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                <Search size={12} />
                Workspace
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-neutral-100">
                <span className="font-medium">{imageCountLabel}</span>
                <span className="h-1 w-1 rounded-full bg-neutral-700" />
                <span className="text-neutral-400">{searchModeLabel}</span>
              </div>
            </div>

            <div className="min-w-0 flex-1 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge label={statusMeta.badge} tone={statusMeta.tone} />
                <div className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                  {statusMeta.title}
                </div>
                {(indexingSnap.isIndexing || modelSnap.isDownloading) && (
                  <div className="text-xs font-medium text-neutral-400">
                    {statusMeta.percent}%
                  </div>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-neutral-400">{statusMeta.detail}</div>
              <div className="mt-2">
                <ProgressBar
                  value={statusMeta.percent}
                  active={indexingSnap.isIndexing || modelSnap.isDownloading}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="no-drag flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 md:flex">
            <MetricCard label="Library" value={imageCountLabel} />
            <MetricCard
              label="Search"
              value={snap.llmSettings.enabled ? "Semantic + LLM" : searchModeLabel}
            />
          </div>

          <div className="flex items-center gap-1 rounded-2xl border border-white/8 bg-white/[0.03] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <button
              type="button"
              className={iconButtonClass}
              title="Refresh library"
              onClick={() => galleryActions.reload()}
            >
              <RefreshCw size={14} />
            </button>
            <button
              ref={settingsButtonRef}
              type="button"
              className={clsx(
                iconButtonClass,
                settingsOpen &&
                  "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/12 text-[var(--color-primary)]",
              )}
              title="Open settings"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-2xl border border-white/8 bg-white/[0.03] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <button
              type="button"
              className={windowButtonClass}
              title="Minimize"
              onClick={() => window.electron?.min()}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className={windowButtonClass}
              title="Maximize"
              onClick={() => window.electron?.max()}
            >
              <Square size={12} />
            </button>
            <button
              type="button"
              className={clsx(
                windowButtonClass,
                "hover:bg-red-500/14 hover:text-red-200",
              )}
              title="Close"
              onClick={() => window.electron?.close()}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="no-drag absolute right-3 top-[calc(100%+0.75rem)] z-40 w-[440px] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,22,22,0.96),rgba(8,8,8,0.96))] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <div className="mb-4 rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
                  Workspace Control
                </div>
                <div className="mt-1 text-lg font-semibold text-white">Title bar settings</div>
                <div className="mt-1 text-sm text-neutral-400">
                  Manage storage, search, indexing, and window behavior.
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/10 p-2 text-[var(--color-primary)]">
                <Sparkles size={16} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MetricCard label="Library" value={imageCountLabel} />
              <MetricCard
                label="Status"
                value={indexingSnap.isIndexing || modelSnap.isDownloading ? "Busy" : "Ready"}
              />
            </div>
          </div>

          <div className="space-y-3">
            <SettingsSection
              title="Library"
              description="Choose where your local reference library is stored."
            >
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3 text-xs leading-5 text-neutral-400 break-all">
                  {loadingStorageDir ? t("common.loading") : storageDir || "Unavailable"}
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition-all hover:border-white/20 hover:bg-white/[0.08]"
                  onClick={handleChooseStorageDir}
                >
                  <FolderOpen size={14} />
                  Change folder
                </button>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Search"
              description="Control semantic retrieval and optional query translation."
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-neutral-100">Semantic search</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      Enable vector indexing and similarity search for the library.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={snap.enableVectorSearch}
                    onToggle={() => {
                      void handleToggleVectorSearch(!snap.enableVectorSearch);
                    }}
                  />
                </div>

                {snap.enableVectorSearch && (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-neutral-100">
                          Query translation
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          Translate natural-language queries before semantic search.
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={snap.llmSettings.enabled}
                        onToggle={() =>
                          globalActions.setLlmSettings({
                            enabled: !snap.llmSettings.enabled,
                          })
                        }
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
                  </div>
                )}
              </div>
            </SettingsSection>

            <SettingsSection
              title="Indexing"
              description="Update missing metadata and monitor library activity."
            >
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-100">
                        {statusMeta.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-neutral-400">
                        {statusMeta.detail}
                      </div>
                    </div>
                    <StatusBadge
                      label={statusMeta.badge}
                      tone={statusMeta.tone}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <ProgressBar
                        value={statusMeta.percent}
                        active={indexingSnap.isIndexing || modelSnap.isDownloading}
                      />
                    </div>
                    <div className="text-xs font-medium text-neutral-400">
                      {indexingSnap.isIndexing || modelSnap.isDownloading
                        ? `${statusMeta.percent}%`
                        : "Idle"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition-all hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleIndexMissingImages}
                  disabled={isIndexing}
                >
                  <RefreshCw size={14} className={clsx(isIndexing && "animate-spin")} />
                  {isIndexing ? "Indexing..." : "Index missing images"}
                </button>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Window"
              description="Set the shortcut used to toggle the OnlyRef window."
            >
              <ShortcutInput
                value={snap.toggleWindowShortcut}
                onChange={(value) => {
                  void handleToggleWindowShortcut(value);
                }}
                onInvalid={() =>
                  globalActions.pushToast({ key: "toast.shortcutInvalid" }, "error")
                }
              />
            </SettingsSection>
          </div>
        </div>
      )}
    </div>
  );
};
