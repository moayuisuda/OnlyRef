import React, { useEffect, useRef, useState } from "react";
import {
  Circle,
  FolderOpen,
  Minus,
  Settings,
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
  "flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-white";

const windowButtonClass =
  "flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-white";

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

export const TitleBar: React.FC = () => {
  const snap = useSnapshot(globalState);
  const gallerySnap = useSnapshot(galleryState);
  const indexingSnap = useSnapshot(indexingState);
  const { t, locale, setLocale } = useT();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageDir, setStorageDir] = useState("");
  const [loadingStorageDir, setLoadingStorageDir] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const indexingResetTimerRef = useRef<number | null>(null);

  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  useClickOutside<HTMLElement>([settingsButtonRef, settingsPanelRef], () => {
    setSettingsOpen(false);
  });

  useEffect(() => {
    window.electron?.setSettingsOpen?.(settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
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
      cleanupIndexing?.();
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen || !window.electron?.getStorageDir) return;

    let cancelled = false;
    setLoadingStorageDir(true);
    void window.electron
      .getStorageDir()
      .then((dir) => {
        if (cancelled) return;
        setStorageDir(dir);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingStorageDir(false);
      });

    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  useEffect(() => {
    return () => {
      if (indexingResetTimerRef.current !== null) {
        window.clearTimeout(indexingResetTimerRef.current);
      }
    };
  }, []);

  const handleChooseStorageDir = async () => {
    if (!window.electron?.chooseStorageDir) return;
    const nextDir = await window.electron.chooseStorageDir();
    if (typeof nextDir === "string" && nextDir.trim()) {
      setStorageDir(nextDir);
    }
  };

  const handleOpenStorageDir = async () => {
    if (!window.electron?.openStorageDir) return;
    const result = await window.electron.openStorageDir();
    if (result?.success !== true) {
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
    }
  };

  const handleIndexMissingImages = async () => {
    if (indexingResetTimerRef.current !== null) {
      window.clearTimeout(indexingResetTimerRef.current);
      indexingResetTimerRef.current = null;
    }
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
      indexingResetTimerRef.current = window.setTimeout(() => {
        indexingActions.reset();
        indexingResetTimerRef.current = null;
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
      : null;

  const imageCount = gallerySnap.images.length;
  const imageCountLabel = t(
    imageCount === 1 ? "settings.imageCount.one" : "settings.imageCount.other",
    { count: imageCount },
  );

  const statusMeta = indexingSnap.isIndexing
    ? {
        title: progressText ?? t("settings.status.indexingTitleFallback"),
        detail:
          indexingSnap.filename ||
          t("settings.status.indexingDetailFallback"),
        percent:
          indexingSnap.total > 0
            ? Math.round((indexingSnap.current / indexingSnap.total) * 100)
            : 12,
      }
      : {
          title: imageCountLabel,
          detail: snap.enableVectorSearch
            ? snap.llmSettings.enabled
              ? t("settings.status.ready.semanticAndTranslation")
              : t("settings.status.ready.semantic")
            : t("settings.status.ready.basic"),
          percent: 100,
        };

  return (
    <div className="draggable relative z-30 border-b border-white/6 bg-neutral-950/92 backdrop-blur-xl">
      <div className="relative flex h-9 items-center gap-3 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex items-center">
            <div className="text-sm font-semibold text-[var(--color-primary)]">PiCaptain</div>
          </div>

          <div className="hidden min-w-0 flex-1 items-center gap-2 text-xs md:flex">
            <div className="min-w-0 truncate text-neutral-400">{statusMeta.title}</div>
            {indexingSnap.isIndexing && (
              <>
                <div className="w-16 shrink-0">
                  <ProgressBar value={statusMeta.percent} />
                </div>
                <div className="shrink-0 text-[11px] text-neutral-500">{statusMeta.percent}%</div>
              </>
            )}
          </div>
        </div>

        <div className="no-drag flex items-center gap-1">
          <button
            type="button"
            className={clsx(
              iconButtonClass,
              snap.floatingWindowMode && "bg-white/[0.08] text-[var(--color-primary)]",
            )}
            title={t("titleBar.floatingMode")}
            onClick={() => {
              setSettingsOpen(false);
              void globalActions.setFloatingWindowMode(!snap.floatingWindowMode);
            }}
          >
            <Circle size={14} className={clsx(snap.floatingWindowMode && "fill-current")} />
          </button>
          <button
            ref={settingsButtonRef}
            type="button"
            className={clsx(
              iconButtonClass,
              settingsOpen && "bg-white/[0.08] text-[var(--color-primary)]",
            )}
            title={t("settings.open")}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings size={14} />
          </button>
          <div className="mx-1 h-4 w-px bg-white/8" />
          <button
            type="button"
            className={windowButtonClass}
            title={t("titleBar.minimize")}
            onClick={() => window.electron?.min()}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className={windowButtonClass}
            title={t("titleBar.maximize")}
            onClick={() => window.electron?.max()}
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            className={clsx(windowButtonClass, "hover:bg-red-500/14 hover:text-red-200")}
            title={t("common.close")}
            onClick={() => window.electron?.close()}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="no-drag absolute right-3 top-[calc(100%+0.5rem)] z-40 w-[360px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,20,0.97),rgba(10,10,10,0.97))] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">{t("titleBar.settings")}</div>
            <div className="text-[11px] text-neutral-500">{imageCountLabel}</div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/8 bg-black/20">
            <div className="border-b border-white/6 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-200">
                    {t("settings.storageFolder")}
                  </div>
                  <div className="mt-1 break-all text-[11px] leading-5 text-neutral-500">
                    {loadingStorageDir ? t("common.loading") : storageDir || t("common.unavailable")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-white/[0.08]"
                    onClick={handleOpenStorageDir}
                  >
                    <FolderOpen size={12} />
                    {t("common.open")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-white/[0.08]"
                    onClick={handleChooseStorageDir}
                  >
                    <FolderOpen size={12} />
                    {t("titleBar.change")}
                  </button>
                </div>
              </div>
            </div>

            <div className="border-b border-white/6 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-neutral-200">{t("common.language")}</div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {locale === "en" ? t("common.language.en") : t("common.language.zh")}
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
                  <button
                    type="button"
                    className={clsx(
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      locale === "en"
                        ? "bg-[var(--color-primary)] text-black"
                        : "text-neutral-300 hover:bg-white/[0.08]",
                    )}
                    onClick={() => setLocale("en")}
                  >
                    {t("common.language.en")}
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      locale === "zh"
                        ? "bg-[var(--color-primary)] text-black"
                        : "text-neutral-300 hover:bg-white/[0.08]",
                    )}
                    onClick={() => setLocale("zh")}
                  >
                    {t("common.language.zh")}
                  </button>
                </div>
              </div>
            </div>

            <div className="border-b border-white/6 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-neutral-200">
                    {t("settings.queryTranslation")}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {t("settings.queryTranslation.desc")}
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
                <div className="mt-3 space-y-2">
                  <SettingInput
                    value={snap.llmSettings.baseUrl}
                    placeholder={t("settings.llm.baseUrl")}
                    onChange={(value) => globalActions.setLlmSettings({ baseUrl: value })}
                  />
                  <SettingInput
                    value={snap.llmSettings.key}
                    placeholder={t("settings.llm.key")}
                    type="password"
                    onChange={(value) => globalActions.setLlmSettings({ key: value })}
                  />
                  <SettingInput
                    value={snap.llmSettings.model}
                    placeholder={t("settings.llm.model")}
                    onChange={(value) => globalActions.setLlmSettings({ model: value })}
                  />
                </div>
              )}
            </div>

            <div className="border-b border-white/6 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-neutral-200">
                    {t("settings.indexing")}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-neutral-500">
                    {statusMeta.title}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleIndexMissingImages}
                  disabled={isIndexing}
                >
                  <span
                    className={clsx(
                      "inline-block h-1.5 w-1.5 rounded-full bg-current",
                      isIndexing && "animate-pulse",
                    )}
                  />
                  {isIndexing ? t("settings.running") : t("settings.run")}
                </button>
              </div>

              {indexingSnap.isIndexing && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ProgressBar
                      value={statusMeta.percent}
                      active={indexingSnap.isIndexing}
                    />
                  </div>
                  <div className="text-[11px] text-neutral-500">{statusMeta.percent}%</div>
                </div>
              )}
            </div>

            <div className="px-3 py-3">
              <div className="mb-2 text-xs font-medium text-neutral-200">
                {t("settings.toggleWindowShortcut")}
              </div>
              <ShortcutInput
                value={snap.toggleWindowShortcut}
                onChange={(value) => {
                  void handleToggleWindowShortcut(value);
                }}
                onInvalid={() =>
                  globalActions.pushToast({ key: "toast.shortcutInvalid" }, "error")
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
