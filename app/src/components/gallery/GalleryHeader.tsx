import React, { useEffect, useMemo, useRef, useState } from "react";
import Input from "rc-input";
import { Image as ImageIcon, Plus, Search, X } from "lucide-react";
import { useSnapshot } from "valtio";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { debounce } from "radash";
import { Tag } from "../Tag";
import { SortableTag } from "./SortableTag";
import { ColorInput } from "./ColorInput";
import { Swatch } from "./Swatch";
import { ConfirmModal } from "../ConfirmModal";
import { globalActions, globalState } from "../../store/globalStore";
import { state, actions } from "../../store/galleryStore";
import type { ImageMeta } from "../../store/galleryStore";
import { THEME, hexToRgba } from "../../theme";
import {
  createTag,
  deleteTag as deleteTagService,
  getLocalImagePreviewUrl,
  renameTag,
} from "../../service";
import { useT } from "../../i18n/useT";
import type { I18nKey } from "../../../shared/i18n/types";
import { useClickOutside } from "../../hooks/useClickOutside";

const POPOVER_WIDTH = 280;
type NativePathFile = File & { path?: string };

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
    window.innerWidth - POPOVER_WIDTH - 12,
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
  const [searchDraft, setSearchDraft] = useState(snap.searchQuery);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const debouncedSetSearchQuery = useMemo(
    () =>
      debounce({ delay: 240 }, (nextQuery: string) => {
        actions.setSearchQuery(nextQuery);
      }),
    [],
  );

  useEffect(() => {
    setSearchDraft(snap.searchQuery);
  }, [snap.searchQuery]);

  useEffect(() => {
    return () => {
      debouncedSetSearchQuery.cancel();
    };
  }, [debouncedSetSearchQuery]);

  useEffect(() => {
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

  const [pendingDeleteTag, setPendingDeleteTag] = useState<string | null>(null);
  const [creatingTagId, setCreatingTagId] = useState<string | null>(null);

  const [searchColorPicker, setSearchColorPicker] = useState<{
    x: number;
    y: number;
    editingSwatchIndex: number | null;
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  useClickOutside<HTMLElement>([popoverRef, colorButtonRef], () =>
    setSearchColorPicker(null),
  );

  const handleSearchColorChange = (next: string) => {
    actions.setSearchColor(next);
    const index = searchColorPicker?.editingSwatchIndex;
    if (typeof index === "number") {
      globalActions.setColorSwatch(index, next);
    }
  };

  const handleRenameTag = async (oldTag: string, newTag: string) => {
    try {
      await renameTag(oldTag, newTag);

      const nextImages = state.images.map((img) => {
        if (img.tags && img.tags.includes(oldTag)) {
          const nextTags = img.tags.map((t) => (t === oldTag ? newTag : t));
          const uniqueTags = Array.from(new Set(nextTags));
          return { ...img, tags: uniqueTags };
        }
        return img;
      });
      actions.setImages(nextImages as ImageMeta[]);

      if (state.searchTags.includes(oldTag)) {
        const nextSearchTags = state.searchTags.map((t) =>
          t === oldTag ? newTag : t,
        );
        actions.setSearchTags(nextSearchTags);
      }

      if (state.tagSortOrder && state.tagSortOrder.includes(oldTag)) {
        const nextOrder = state.tagSortOrder.map((t) =>
          t === oldTag ? newTag : t,
        );
        actions.setTagSortOrder(nextOrder);
      }

      globalActions.pushToast({ key: "toast.tagRenamed" }, "success");
      void actions.loadTags();
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.tagRenameFailed" }, "error");
    }
  };

  const handleDeleteTag = async (tag: string) => {
    try {
      await deleteTagService(tag);

      const nextImages = state.images.map((img) => ({
        ...img,
        tags: img.tags.filter((item) => item !== tag),
      }));
      actions.setImages(nextImages as ImageMeta[]);

      if (state.searchTags.includes(tag)) {
        actions.setSearchTags(state.searchTags.filter((item) => item !== tag));
      }

      if (state.tagSortOrder.includes(tag)) {
        actions.setTagSortOrder(
          state.tagSortOrder.filter((item) => item !== tag),
        );
      }

      globalActions.pushToast({ key: "toast.tagDeleted" }, "success");
      void actions.loadTags();
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.tagDeleteFailed" }, "error");
    } finally {
      setPendingDeleteTag(null);
    }
  };

  const handleCreateTag = async (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag) {
      setCreatingTagId(null);
      return true;
    }
    if (allTags.includes(tag)) {
      setCreatingTagId(null);
      return true;
    }

    try {
      await createTag(tag);
      setCreatingTagId(null);
      if (!state.tagSortOrder.includes(tag)) {
        actions.setTagSortOrder([...state.tagSortOrder, tag]);
      }
      await actions.loadTags();
      return true;
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.createTagFailed" }, "error");
      return false;
    }
  };

  const handlePickSearchImage = () => {
    if (window.electron?.chooseSearchImage) {
      void window.electron.chooseSearchImage().then((result) => {
        if (!result?.path) return;
        const previewName =
          result.name.trim() || t("gallery.searchImage.defaultName");
        actions.setSearchImageSource({
          type: "local",
          localPath: result.path,
          previewUrl: getLocalImagePreviewUrl(result.path),
          previewName,
          revokePreviewUrl: false,
        });
      });
      return;
    }

    const input = imageInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const handleSearchImageChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] as NativePathFile | undefined;
    if (!file) return;

    const localPath = typeof file.path === "string" ? file.path.trim() : "";
    if (!localPath) {
      globalActions.pushToast({ key: "toast.imageVectorSearchFailed" }, "error");
      return;
    }

    const previewName = file.name.trim() || t("gallery.searchImage.defaultName");
    actions.setSearchImageSource({
      type: "local",
      localPath,
      previewUrl: getLocalImagePreviewUrl(localPath),
      previewName,
      revokePreviewUrl: false,
    });
  };

  const searchPlaceholder = snap.searchImage
    ? t("gallery.searchPlaceholderImage")
    : t("gallery.searchPlaceholder");

  return (
    <>
      <div className="p-3">
        <div className="relative">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSearchImageChange}
          />
          <div
            className="flex items-center gap-2 w-full bg-neutral-800 text-white p-1 px-2 rounded text-sm focus-within:ring-1 focus-within:ring-[var(--brand-color)]"
            style={{ "--brand-color": THEME.primary } as React.CSSProperties}
          >
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-black/20 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
              title={t("gallery.searchImage.pick")}
              onClick={handlePickSearchImage}
            >
              <ImageIcon size={15} />
            </button>

            {snap.searchImage && (
              <div className="flex h-7 min-w-0 shrink-0 items-center gap-1.5 overflow-hidden rounded-md border border-neutral-700/80 bg-black/20 px-1.5">
                <img
                  src={snap.searchImage.previewUrl}
                  alt={snap.searchImage.previewName}
                  className="h-6 w-6 rounded object-cover"
                />
                <div className="min-w-0 max-w-[120px] text-xs text-neutral-200 truncate">
                  {snap.searchImage.previewName}
                </div>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-700/70 hover:text-white"
                  title={t("common.clear")}
                  onClick={() => actions.clearSearchImageSource()}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <Search className="text-neutral-500 shrink-0" size={16} />

            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {snap.searchTags.map((tag) => (
                <Tag
                  key={tag}
                  tag={tag}
                  isEdit={true}
                  showColor={false}
                  onClick={() =>
                    actions.setSearchTags(
                      snap.searchTags.filter((t) => t !== tag),
                    )
                  }
                />
              ))}
              <Input
                placeholder={searchPlaceholder}
                className={`flex-1 bg-transparent text-sm outline-none min-w-[80px] placeholder-neutral-500 ${
                  snap.searchImage
                    ? "cursor-not-allowed text-neutral-500"
                    : "text-white"
                }`}
                value={searchDraft}
                disabled={!!snap.searchImage}
                onChange={(e) => {
                  const nextQuery = e.target.value;
                  setSearchDraft(nextQuery);
                  debouncedSetSearchQuery(nextQuery);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    debouncedSetSearchQuery.cancel();
                    actions.setSearchQuery(searchDraft);
                    return;
                  }
                  if (
                    e.key === "Backspace" &&
                    searchDraft === "" &&
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
                className="w-4 h-4 rounded-full animate-spin shrink-0"
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
              className="w-5 h-5 rounded ring-2 transition-colors shrink-0 overflow-hidden"
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
              title={(() => {
                const toneKey = snap.searchTone
                  ? TONE_LABEL_KEYS[snap.searchTone]
                  : undefined;
                const toneText = toneKey ? t(toneKey) : "";
                if (snap.searchColor && toneText) {
                  return t("gallery.filterSummary.colorTone", {
                    color: snap.searchColor,
                    tone: toneText,
                  });
                }
                if (snap.searchColor) {
                  return t("gallery.filterSummary.color", {
                    color: snap.searchColor,
                  });
                }
                if (toneText) {
                  return t("gallery.filterSummary.tone", { tone: toneText });
                }
                return t("gallery.filter");
              })()}
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
                const matchingSwatchIndex = snap.searchColor
                  ? appSnap.colorSwatches.findIndex(
                      (color) =>
                        color.toLowerCase() === snap.searchColor?.toLowerCase(),
                    )
                  : -1;
                setSearchColorPicker({
                  x: next.x,
                  y: next.y,
                  editingSwatchIndex:
                    matchingSwatchIndex >= 0 ? matchingSwatchIndex : null,
                });
              }}
            />

            {(snap.searchTags.length > 0 ||
              snap.searchQuery.trim() ||
              snap.searchImage ||
              snap.searchColor ||
              snap.searchTone) && (
              <button
                className="w-4 inline-flex items-center justify-center rounded hover:bg-neutral-700/70 text-neutral-400 hover:text-white transition-colors shrink-0"
                onClick={() => {
                  debouncedSetSearchQuery.cancel();
                  setSearchDraft("");
                  actions.clearSearch();
                }}
                title={t("common.clear")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {allTags.length > 0 && (
            <SortableContext items={allTags} strategy={rectSortingStrategy}>
              <>
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
                    onDelete={(nextTag) => setPendingDeleteTag(nextTag)}
                  />
                ))}
              </>
            </SortableContext>
          )}

          {creatingTagId && (
            <SortableTag
              itemId={creatingTagId}
              tag=""
              isDraft={true}
              autoEdit={true}
              onClick={() => {}}
              onCreate={handleCreateTag}
              onCancelDraft={() => setCreatingTagId(null)}
            />
          )}

          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-white/12 bg-white/[0.03] text-neutral-500 transition-all hover:border-white/24 hover:bg-white/[0.08] hover:text-white disabled:cursor-default disabled:opacity-40"
            title={t("common.add")}
            aria-label={t("common.add")}
            disabled={creatingTagId !== null}
            onClick={() => {
              setCreatingTagId(`draft-tag-${Date.now()}`);
            }}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={pendingDeleteTag !== null}
        title={t("tag.deleteConfirmTitle")}
        message={t("tag.deleteConfirmMessage", {
          tag: pendingDeleteTag ?? "",
        })}
        confirmText={t("common.delete")}
        variant="danger"
        onCancel={() => setPendingDeleteTag(null)}
        onConfirm={() => {
          if (!pendingDeleteTag) return;
          void handleDeleteTag(pendingDeleteTag);
        }}
      />

      {searchColorPicker && (
        <>
          <div
            ref={popoverRef}
            className="fixed z-[61] w-62 bg-neutral-900/95 border border-neutral-700/80 rounded-xl shadow-2xl p-3 backdrop-blur"
            style={{
              top: searchColorPicker.y,
              left: searchColorPicker.x,
              width: POPOVER_WIDTH,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-200 font-semibold">
                {t("gallery.colorFilter.title")}
              </div>
              <button
                type="button"
                className="text-xs text-neutral-400 hover:text-white transition-colors"
                onClick={() => {
                  actions.setSearchColor(null);
                  setSearchColorPicker({
                    ...searchColorPicker,
                    editingSwatchIndex: null,
                  });
                }}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ColorInput
                value={
                  typeof searchColorPicker.editingSwatchIndex === "number"
                    ? appSnap.colorSwatches[searchColorPicker.editingSwatchIndex]
                    : snap.searchColor
                }
                onChange={handleSearchColorChange}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-200 font-semibold truncate">
                  {t("gallery.colorFilter.selected")}
                </div>
                <div className="text-xs text-neutral-500 truncate">
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
                      searchColorPicker.editingSwatchIndex === i ||
                      (!!snap.searchColor &&
                        c.toLowerCase() === snap.searchColor.toLowerCase())
                    }
                    onPress={() => {
                      setSearchColorPicker({
                        ...searchColorPicker,
                        editingSwatchIndex: i,
                      });
                      actions.setSearchColor(c);
                    }}
                    onReplaceWithCurrent={() =>
                      globalActions.setColorSwatch(i, current)
                    }
                  />
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-700/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs text-neutral-200 font-semibold">
                  {t("gallery.toneFilter.title")}
                </div>
                {snap.searchTone && (
                  <button
                    type="button"
                    className="text-xs text-neutral-400 hover:text-white transition-colors"
                    onClick={() => actions.setSearchTone(null)}
                  >
                    {t("common.clear")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1.5 items-center">
                {/* Header Row */}
                <div className="text-[10px] text-neutral-500 font-medium text-right pr-1"></div>
                {TONE_RANGES.map((range) => (
                  <div
                    key={range}
                    className="text-[10px] text-neutral-500 font-medium text-center"
                  >
                    {t(toneRangeLabelKey(range))}
                  </div>
                ))}

                {/* Rows */}
                {TONE_MATRIX.map((row, rowIndex) => (
                  <React.Fragment key={rowIndex}>
                    <div className="text-[10px] text-neutral-500 font-medium text-right pr-1">
                      {t(toneKeyLabelKey(TONE_KEYS[rowIndex]))}
                    </div>
                    {row.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`h-6 rounded overflow-hidden relative ring-1 transition-all ${
                          snap.searchTone === key
                            ? "ring-white ring-offset-1 ring-offset-neutral-900 z-10"
                            : "ring-white/10 hover:ring-white/30"
                        }`}
                        style={{ background: TONE_GRADIENTS[key] }}
                        title={t(TONE_LABEL_KEYS[key] ?? "tone.unknown")}
                        onClick={() =>
                          actions.setSearchTone(
                            key === snap.searchTone ? null : key,
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
