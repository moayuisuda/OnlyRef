import { useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { Check, Image, Monitor, RefreshCw, TimerReset } from "lucide-react";
import { useSnapshot } from "valtio";
import {
  WALLPAPER_IMAGE_COUNT_OPTIONS,
  WALLPAPER_INTERVAL_OPTIONS,
  type WallpaperImageCount,
  type WallpaperIntervalMinutes,
} from "../../shared/wallpaper";
import { useT } from "../i18n/useT";
import {
  wallpaperActions,
  wallpaperState,
} from "../store/wallpaperStore";
import { ToggleSwitch } from "./ToggleSwitch";
import type { I18nKey } from "../../shared/i18n/types";

const INTERVAL_KEY_BY_MINUTES: Record<WallpaperIntervalMinutes, I18nKey> = {
  15: "wallpaper.interval.15",
  30: "wallpaper.interval.30",
  60: "wallpaper.interval.60",
  180: "wallpaper.interval.180",
  360: "wallpaper.interval.360",
  720: "wallpaper.interval.720",
  1440: "wallpaper.interval.1440",
  4320: "wallpaper.interval.4320",
  10080: "wallpaper.interval.10080",
};

const formatTime = (timestamp: number | null, locale: string): string => {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
};

export const WallpaperPanel = () => {
  const snap = useSnapshot(wallpaperState);
  const { t, locale } = useT();

  const isDisplaySelected = (displayId: string): boolean =>
    snap.settings.targetDisplayIds === null
      ? snap.displays.some(
          (display) => display.id === displayId && display.isPrimary,
        )
      : snap.settings.targetDisplayIds.includes(displayId);

  const selectedDisplayCount =
    snap.settings.targetDisplayIds === null
      ? snap.displays.filter((display) => display.isPrimary).length
      : snap.displays.filter((display) =>
          snap.settings.targetDisplayIds?.includes(display.id),
        ).length;

  useEffect(() => {
    void wallpaperActions.load();
  }, []);

  const statusText = useMemo(() => {
    if (!snap.supported) return t("wallpaper.status.unsupported");
    if (snap.updating) return t("wallpaper.status.updating");
    if (snap.errorCode === "not-enough-images") {
      return t("wallpaper.status.notEnoughImages");
    }
    if (snap.errorCode === "generation-failed") {
      return t("wallpaper.status.generationFailed");
    }
    if (snap.errorCode === "apply-failed") {
      return t("wallpaper.status.applyFailed");
    }
    if (snap.errorCode === "cleanup-failed") {
      return t("wallpaper.status.cleanupFailed");
    }
    if (snap.errorCode === "display-unavailable") {
      return t("wallpaper.status.displayUnavailable");
    }
    if (snap.errorCode === "request-failed") {
      return t("wallpaper.status.requestFailed");
    }
    if (selectedDisplayCount === 0) {
      return t("wallpaper.status.noDisplaySelected");
    }
    if (snap.settings.enabled && snap.nextUpdatedAt) {
      return t("wallpaper.status.nextUpdate", {
        time: formatTime(snap.nextUpdatedAt, locale),
      });
    }
    if (snap.lastUpdatedAt) {
      return t("wallpaper.status.lastUpdate", {
        time: formatTime(snap.lastUpdatedAt, locale),
      });
    }
    return t("wallpaper.status.ready");
  }, [
    locale,
    snap.errorCode,
    snap.lastUpdatedAt,
    snap.nextUpdatedAt,
    snap.settings.enabled,
    snap.supported,
    snap.updating,
    selectedDisplayCount,
    t,
  ]);

  const updateSettings = (
    patch: Partial<{
      enabled: boolean;
      intervalMinutes: WallpaperIntervalMinutes;
      imageCount: WallpaperImageCount;
      targetDisplayIds: string[] | null;
    }>,
  ) => {
    const currentTargets = wallpaperState.settings.targetDisplayIds;
    void wallpaperActions.updateSettings({
      enabled: patch.enabled ?? wallpaperState.settings.enabled,
      intervalMinutes:
        patch.intervalMinutes ?? wallpaperState.settings.intervalMinutes,
      imageCount: patch.imageCount ?? wallpaperState.settings.imageCount,
      targetDisplayIds:
        "targetDisplayIds" in patch
          ? (patch.targetDisplayIds ?? null)
          : currentTargets
            ? [...currentTargets]
            : null,
    });
  };

  const toggleDisplay = (displayId: string) => {
    const primaryDisplayIds = wallpaperState.displays
      .filter((display) => display.isPrimary)
      .map((display) => display.id);
    const current = wallpaperState.settings.targetDisplayIds
      ? [...wallpaperState.settings.targetDisplayIds]
      : [...primaryDisplayIds];
    const index = current.indexOf(displayId);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(displayId);
    }

    const selectsPrimaryOnly =
      current.length === primaryDisplayIds.length &&
      primaryDisplayIds.every((id) => current.includes(id));
    updateSettings({
      enabled: current.length === 0 ? false : wallpaperState.settings.enabled,
      targetDisplayIds: selectsPrimaryOnly ? null : current,
    });
  };

  return (
    <div className="w-[360px] p-4">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Image size={15} className="text-[var(--color-primary)]" />
            {t("wallpaper.title")}
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-neutral-500">
            {t("wallpaper.description")}
          </p>
        </div>
        <ToggleSwitch
          checked={snap.settings.enabled}
          disabled={
            !snap.supported ||
            snap.saving ||
            (!snap.settings.enabled && selectedDisplayCount === 0)
          }
          onToggle={() => updateSettings({ enabled: !wallpaperState.settings.enabled })}
        />
      </div>

      <div className="mt-4 border-y border-white/[0.07] py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-300">{t("wallpaper.displays")}</div>
          <div className="text-[10px] text-neutral-600">
            {t("wallpaper.displays.selected", {
              selected: selectedDisplayCount,
              total: snap.displays.length,
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-neutral-950/60">
          {snap.displays.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-neutral-500">
              {t("wallpaper.displays.empty")}
            </div>
          ) : (
            snap.displays.map((display, index) => {
              const selected = isDisplaySelected(display.id);
              return (
                <button
                  key={display.id}
                  type="button"
                  aria-pressed={selected}
                  className={clsx(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    index > 0 && "border-t border-white/[0.06]",
                    selected
                      ? "bg-white/[0.035] text-neutral-200"
                      : "text-neutral-500 hover:bg-white/[0.025] hover:text-neutral-300",
                  )}
                  disabled={
                    !snap.supported ||
                    snap.saving ||
                    snap.updating
                  }
                  onClick={() => toggleDisplay(display.id)}
                >
                  <span
                    className={clsx(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      selected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-neutral-950"
                        : "border-neutral-700 bg-neutral-900",
                    )}
                  >
                    {selected && <Check size={11} strokeWidth={3} />}
                  </span>
                  <Monitor size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {display.name ||
                      t("wallpaper.displayName", { index: display.index + 1 })}
                  </span>
                  {display.isPrimary && (
                    <span className="text-[10px] text-[var(--color-primary)]">
                      {t("wallpaper.primaryDisplay")}
                    </span>
                  )}
                  <span className="text-[10px] tabular-nums text-neutral-600">
                    {display.width}×{display.height}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 border-b border-white/[0.07] py-3">
        <label className="text-xs text-neutral-300" htmlFor="wallpaper-interval">
          {t("wallpaper.interval")}
        </label>
        <select
          id="wallpaper-interval"
          className="w-32 rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-right text-xs text-neutral-100 outline-none transition-colors focus:border-[var(--color-primary)] disabled:opacity-45"
          value={snap.settings.intervalMinutes}
          disabled={!snap.supported || snap.saving || snap.updating}
          onChange={(event) =>
            updateSettings({
              intervalMinutes: Number(event.target.value) as WallpaperIntervalMinutes,
            })
          }
        >
          {WALLPAPER_INTERVAL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t(INTERVAL_KEY_BY_MINUTES[minutes])}
            </option>
          ))}
        </select>

        <div className="text-xs text-neutral-300">{t("wallpaper.imageCount")}</div>
        <div className="grid grid-cols-6 rounded-lg border border-white/10 bg-neutral-900 p-0.5">
          {WALLPAPER_IMAGE_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              className={clsx(
                "h-6 min-w-8 rounded-md px-1.5 text-xs transition-colors",
                snap.settings.imageCount === count
                  ? "bg-white/[0.1] text-white"
                  : "text-neutral-500 hover:text-neutral-200",
              )}
              disabled={!snap.supported || snap.saving || snap.updating}
              onClick={() => updateSettings({ imageCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-500">
          <TimerReset size={12} className="shrink-0" />
          <span className="truncate">{statusText}</span>
        </div>
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-neutral-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={
            !snap.supported ||
            selectedDisplayCount === 0 ||
            snap.updating ||
            snap.saving
          }
          onClick={() => void wallpaperActions.refresh()}
        >
          <RefreshCw size={12} className={clsx(snap.updating && "animate-spin")} />
          {t("wallpaper.refreshNow")}
        </button>
      </div>
    </div>
  );
};
