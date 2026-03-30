import React, { useMemo, useState, useRef } from "react";
import type { ChangeEvent } from "react";
import Input from "rc-input";
import { Search, X } from "lucide-react";
import { useSnapshot } from "valtio";
import { debounce } from "radash";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { Tag } from "../Tag";
import { SortableTag } from "./SortableTag";
import { ColorInput } from "./ColorInput";
import { Swatch } from "./Swatch";
import { globalActions, globalState } from "../../store/globalStore";
import { state, actions } from "../../store/galleryStore";
import type { ImageMeta } from "../../store/galleryStore";
import { THEME, hexToRgba } from "../../theme";
import { renameTag } from "../../service";
import { useT } from "../../i18n/useT";
import type { I18nKey } from "../../../shared/i18n/types";
import { useClickOutside } from "../../hooks/useClickOutside";

const POPOVER_WIDTH = 280;

const TONE_KEYS = ["high", "mid", "low"] as const;
const TONE_RANGES = ["short", "mid", "long"] as const;

const TONE_MATRIX: string[][] = [
  ["high-short", "high-mid", "high-long"],
  ["mid-short", "mid-mid", "mid-long"],
  ["low-short", "low-mid", "low-long"],
];

const TONE_GRADIENTS: Record<string, string> = {
  "high-short": "linear-gradient(135deg, #ffffff 0%, #dddddd 100%)",
  "high-mid": "linear-gradient(135deg, #ffffff 0%, #999999 100%)",
  "high-long": "linear-gradient(135deg, #ffffff 0%, 70%, #000000 100%)",
  "mid-short": "linear-gradient(135deg, #bbbbbb 0%, #888888 100%)",
  "mid-mid": "linear-gradient(135deg, #dddddd 0%, #444444 100%)",
  "mid-long": "linear-gradient(135deg, #ffffff 0%, #000000 100%)",
  "low-short": "linear-gradient(135deg, #444444 0%, #222222 100%)",
  "low-mid": "linear-gradient(135deg, #777777 0%, #000000 100%)",
  "low-long": "linear-gradient(135deg, #ffffff 0%, 30%, #000000 100%)",
};

const TONE_LABEL_KEYS: Record<string, I18nKey> = {
  "high-short": "tone.label.highShort",
  "high-mid": "tone.label.highMid",
  "high-long": "tone.label.highLong",
  "mid-short": "tone.label.midShort",
  "mid-mid": "tone.label.midMid",
  "mid-long": "tone.label.midLong",
  "low-short": "tone.label.lowShort",
  "low-mid": "tone.label.lowMid",
  "low-long": "tone.label.lowLong",
};

const toneKeyLabelKey = (key: (typeof TONE_KEYS)[number]): I18nKey => {
  if (key === "high") return "tone.key.high";
  if (key === "mid") return "tone.key.mid";
  return "tone.key.low";
};

const toneRangeLabelKey = (key: (typeof TONE_RANGES)[number]): I18nKey => {
  if (key === "short") return "tone.range.short";
  if (key === "mid") return "tone.range.mid";
  return "tone.range.long";
};

const clampPopover = (x: number, y: number) => {
  const nextX = Math.min(
    Math.max(12, x),
    window.innerWidth - POPOVER_WIDTH - 12
  );
  const nextY = Math.max(12, y);
  return { x: nextX, y: nextY };
};

interface GalleryHeaderProps {
  loading: boolean;
  allTags: string[];
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
  loading,
  allTags,
}) => {
  const snap = useSnapshot(state);
  const appSnap = useSnapshot(globalState);
  const { t } = useT();

  const [showLoading, setShowLoading] = useState(false);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (loading) {
      timer = setTimeout(() => {
        setShowLoading(true);
      }, 200);
    } else {
      setShowLoading(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  const [searchText, setSearchText] = useState(snap.searchQuery);

  React.useEffect(() => {
    setSearchText(snap.searchQuery);
  }, [snap.searchQuery]);

  const debouncedSetSearchQuery = useMemo(
    () =>
      debounce({ delay: 300 }, (val: string) => {
        actions.setSearchQuery(val);
      }),
    []
  );

  const [searchColorPicker, setSearchColorPicker] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  useClickOutside<HTMLElement>([popoverRef, colorButtonRef], () => setSearchColorPicker(null));

  const handleRenameTag = async (oldTag: string, newTag: string) => {
    try {
      await renameTag(oldTag, newTag);

      const nextImages = snap.images.map((img) => {
        if (img.tags && img.tags.includes(oldTag)) {
          const nextTags = img.tags.map((t) => (t === oldTag ? newTag : t));
          const uniqueTags = Array.from(new Set(nextTags));
          return { ...img, tags: uniqueTags };
        }
        return img;
      });
      actions.setImages(nextImages as ImageMeta[]);

      if (snap.searchTags.includes(oldTag)) {
        const nextSearchTags = snap.searchTags.map((t) =>
          t === oldTag ? newTag : t
        );
        actions.setSearchTags(nextSearchTags);
      }

      if (snap.tagSortOrder && snap.tagSortOrder.includes(oldTag)) {
        const nextOrder = snap.tagSortOrder.map((t) =>
          t === oldTag ? newTag : t
        );
        actions.setTagSortOrder(nextOrder);
      }

      if (Object.prototype.hasOwnProperty.call(appSnap.tagColors, oldTag)) {
        const color = appSnap.tagColors[oldTag];
        globalActions.clearTagColor(oldTag);
        globalActions.setTagColor(newTag, color);
      }

      globalActions.pushToast({ key: "toast.tagRenamed" }, "success");
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.tagRenameFailed" }, "error");
    }
  };

  return (
    <>
      <div className="border-b border-white/8 bg-[rgba(19,23,25,0.62)] px-4 py-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
              Search & Curate
            </div>
            <div className="mt-1 text-sm text-neutral-300">
              Filter by text, tags, color, and tone.
            </div>
          </div>
          <div className="hidden rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-500 md:block">
            {allTags.length} tags
          </div>
        </div>
        <div className="relative">
          <div
            className="surface-panel flex w-full items-center gap-2 rounded-[1.5rem] px-3.5 py-3 text-sm text-white focus-within:ring-1 focus-within:ring-[var(--brand-color)]"
            style={{ "--brand-color": THEME.primary } as React.CSSProperties}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-neutral-400">
              <Search size={15} />
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {snap.searchTags.map((tag) => (
                <Tag
                  key={tag}
                  tag={tag}
                  isEdit={true}
                  showColor={false}
                  onClick={() =>
                    actions.setSearchTags(
                      snap.searchTags.filter((t) => t !== tag)
                    )
                  }
                />
              ))}
              <Input
                placeholder={t("gallery.searchPlaceholder")}
                className="min-w-[80px] flex-1 bg-transparent text-sm text-white outline-none placeholder-neutral-500"
                value={searchText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const val = e.target.value;
                  setSearchText(val);
                  debouncedSetSearchQuery(val);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Backspace" &&
                    searchText === "" &&
                    snap.searchTags.length > 0
                  ) {
                    const next = snap.searchTags.slice(0, -1);
                    actions.setSearchTags(next);
                  }
                }}
              />
            </div>

            {showLoading && (
              <div
                className="h-4 w-4 shrink-0 animate-spin rounded-full"
                style={
                  {
                    border: `2px solid ${THEME.primary}`,
                    borderTopColor: "transparent",
                  } as React.CSSProperties
                }
              ></div>
            )}

            <button
              ref={colorButtonRef}
              type="button"
              className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/8 bg-white/[0.03] ring-2 transition-colors"
              style={
                {
                  "--tw-ring-color":
                    snap.searchColor || snap.searchTone
                      ? hexToRgba(snap.searchColor || "#ffffff", 0.2)
                      : "rgba(255, 255, 255, 0.1)",
                  backgroundColor: snap.searchColor || "transparent",
                  backgroundImage: snap.searchTone
                    ? TONE_GRADIENTS[snap.searchTone]
                    : undefined,
                  backgroundBlendMode: "overlay",
                } as React.CSSProperties
              }
              title={
                (() => {
                  const toneKey = snap.searchTone ? TONE_LABEL_KEYS[snap.searchTone] : undefined;
                  const toneText = toneKey ? t(toneKey) : "";
                  if (snap.searchColor && toneText) {
                    return t("gallery.filterSummary.colorTone", { color: snap.searchColor, tone: toneText });
                  }
                  if (snap.searchColor) {
                    return t("gallery.filterSummary.color", { color: snap.searchColor });
                  }
                  if (toneText) {
                    return t("gallery.filterSummary.tone", { tone: toneText });
                  }
                  return t("gallery.filter");
                })()
              }
              onClick={(e) => {
                e.stopPropagation();
                if (searchColorPicker) {
                  setSearchColorPicker(null);
                  return;
                }
                const rect = (
                  e.currentTarget as HTMLButtonElement
                ).getBoundingClientRect();
                const next = clampPopover(rect.left, rect.bottom);
                setSearchColorPicker({ x: next.x, y: next.y });
              }}
            />

            {(snap.searchTags.length > 0 ||
              searchText.trim() ||
              snap.searchColor ||
              snap.searchTone) && (
              <button
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                onClick={() => {
                  setSearchText("");
                  actions.setSearchQuery("");
                  actions.setSearchTags([]);
                  actions.setSearchColor(null);
                  actions.setSearchTone(null);
                }}
                title={t("common.clear")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {allTags.length > 0 && (
          <SortableContext items={allTags} strategy={rectSortingStrategy}>
            <div className="mt-4 flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <SortableTag
                  key={tag}
                  tag={tag}
                  onClick={() => {
                    const has = snap.searchTags.includes(tag);
                    const next = has
                      ? snap.searchTags.filter((t) => t !== tag)
                      : [...snap.searchTags, tag];
                    actions.setSearchTags(next);
                  }}
                  onRename={handleRenameTag}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      {searchColorPicker && (
        <>
          <div
            ref={popoverRef}
            className="surface-panel-strong fixed z-[61] w-62 rounded-[1.35rem] p-3.5"
            style={{
              top: searchColorPicker.y,
              left: searchColorPicker.x,
              width: POPOVER_WIDTH,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-neutral-200">
                {t("gallery.colorFilter.title")}
              </div>
              <button
                type="button"
                className="text-xs text-neutral-400 transition-colors hover:text-white"
                onClick={() => actions.setSearchColor(null)}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ColorInput
                value={snap.searchColor}
                onChange={(next) => actions.setSearchColor(next)}
              />
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-semibold text-neutral-200">
                  {t("gallery.colorFilter.selected")}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {snap.searchColor || t("common.none")}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-9 gap-1.5">
              {appSnap.colorSwatches.map((c, i) => {
                const current = snap.searchColor || "#39c5bb";
                return (
                  <Swatch
                    key={`${c}_${i}`}
                    color={c}
                    selected={
                      !!snap.searchColor &&
                      c.toLowerCase() === snap.searchColor.toLowerCase()
                    }
                    onPress={() => {
                      if (
                        snap.searchColor &&
                        snap.searchColor.toLowerCase() === c.toLowerCase()
                      ) {
                        actions.setSearchColor(null);
                      } else {
                        actions.setSearchColor(c);
                      }
                    }}
                    onReplaceWithCurrent={() =>
                      globalActions.setColorSwatch(i, current)
                    }
                  />
                );
              })}
            </div>

            <div className="mt-4 border-t border-white/8 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-neutral-200">
                  {t("gallery.toneFilter.title")}
                </div>
                {snap.searchTone && (
                  <button
                    type="button"
                    className="text-xs text-neutral-400 transition-colors hover:text-white"
                    onClick={() => actions.setSearchTone(null)}
                  >
                    {t("common.clear")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-1.5">
                <div className="pr-1 text-right text-[10px] font-medium text-neutral-500"></div>
                {TONE_RANGES.map((range) => (
                  <div
                    key={range}
                    className="text-center text-[10px] font-medium text-neutral-500"
                  >
                    {t(toneRangeLabelKey(range))}
                  </div>
                ))}

                {TONE_MATRIX.map((row, rowIndex) => (
                  <React.Fragment key={rowIndex}>
                    <div className="pr-1 text-right text-[10px] font-medium text-neutral-500">
                      {t(toneKeyLabelKey(TONE_KEYS[rowIndex]))}
                    </div>
                    {row.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`relative h-6 overflow-hidden rounded-md ring-1 transition-all ${
                          snap.searchTone === key
                            ? "z-10 ring-white ring-offset-1 ring-offset-neutral-900"
                            : "ring-white/10 hover:ring-white/30"
                        }`}
                        style={{ background: TONE_GRADIENTS[key] }}
                        title={t(TONE_LABEL_KEYS[key] ?? "tone.unknown")}
                        onClick={() =>
                          actions.setSearchTone(
                            key === snap.searchTone ? null : key
                          )
                        }
                      />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
