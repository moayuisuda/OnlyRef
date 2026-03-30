import React, { useState, useLayoutEffect, useMemo, useRef } from "react";
import { Link, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { type ImageMeta, deriveNameFromFilename } from "../../store/galleryStore";
import { Tag } from "../Tag";
import { THEME, hexToRgba } from "../../theme";
import { debounce } from "radash";
import { useT } from "../../i18n/useT";
import type { I18nKey } from "../../../shared/i18n/types";

const POPOVER_WIDTH = 248;
const POPOVER_HEIGHT = 210;

const TONE_GRADIENTS: Record<string, string> = {
  "high-short": "linear-gradient(135deg, #ffffff 0%, #dddddd 100%)",
  "high-mid": "linear-gradient(135deg, #ffffff 0%, #999999 100%)",
  "high-long": "linear-gradient(135deg, #ffffff 0%, #000000 100%)",
  "mid-short": "linear-gradient(135deg, #bbbbbb 0%, #888888 100%)",
  "mid-mid": "linear-gradient(135deg, #dddddd 0%, #444444 100%)",
  "mid-long": "linear-gradient(135deg, #ffffff 0%, #000000 100%)",
  "low-short": "linear-gradient(135deg, #444444 0%, #222222 100%)",
  "low-mid": "linear-gradient(135deg, #777777 0%, #000000 100%)",
  "low-long": "linear-gradient(135deg, #ffffff 0%, #000000 100%)",
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

const clampPopover = (x: number, y: number) => {
  const nextX = Math.min(
    Math.max(12, x),
    window.innerWidth - POPOVER_WIDTH - 12
  );
  const nextY = Math.min(
    Math.max(12, y),
    window.innerHeight - POPOVER_HEIGHT - 12
  );
  return { x: nextX, y: nextY };
};

export type ContextMenuState = { x: number; y: number; image: ImageMeta };

interface GalleryContextMenuProps {
  value: ContextMenuState;
  image: ImageMeta;
  allTags: string[];
  enableVectorSearch: boolean;
  onClose: () => void;
  onOpenFile: () => void;
  onDelete: () => void;
  onReindex: () => void;
  onOpenDominantColorPicker: (anchor: { x: number; y: number }) => void;
  onUpdateName: (name: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

const ensureTags = (tags: string[] | undefined | null): string[] =>
  Array.isArray(tags) ? tags : [];

export const GalleryContextMenu: React.FC<GalleryContextMenuProps> = ({
  value,
  image,
  allTags,
  enableVectorSearch,
  onClose,
  onOpenFile,
  onDelete,
  onReindex,
  onOpenDominantColorPicker,
  onUpdateName,
  onAddTag,
  onRemoveTag,
}) => {
  const { t } = useT();
  const [menuTagInput, setMenuTagInput] = useState("");
  const menuInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const padding = 8;

    let left = value.x;

    if (left + rect.width + padding > window.innerWidth) {
      left = window.innerWidth - rect.width - padding;
    }
    if (left < padding) left = padding;

    el.style.left = `${left}px`;

    // Intelligent vertical positioning
    // If triggered in the bottom half of the screen, open upwards (anchor bottom)
    // Otherwise open downwards (anchor top)
    if (value.y > window.innerHeight / 2) {
      el.style.bottom = `${window.innerHeight - value.y}px`;
      el.style.top = "auto";
      el.style.maxHeight = `${value.y - padding}px`;
    } else {
      el.style.top = `${value.y}px`;
      el.style.bottom = "auto";
      el.style.maxHeight = `${window.innerHeight - value.y - padding}px`;
    }
  }, [value.x, value.y, image.id]);

  const [menuName, setMenuName] = useState(() =>
    deriveNameFromFilename(image.filename)
  );

  const debouncedUpdateName = useMemo(
    () =>
      debounce({ delay: 500 }, (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        onUpdateName(trimmed);
      }),
    [onUpdateName]
  );

  const dominantColor = image.dominantColor;

  const needle = menuTagInput.trim().toLowerCase();
  const suggestions = allTags
    .filter((t) => t.toLowerCase().includes(needle))
    .filter((t) => !ensureTags(image.tags).includes(t))
    .slice(0, 20);

  return (
    <div
      className="fixed bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl z-50 py-2 w-64 overflow-hidden text-sm"
      style={{
        top: value.y,
        left: value.x,
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
      }}
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-2">
        <div className="text-xs text-neutral-400 mb-1">{t("gallery.contextMenu.nameLabel")}</div>
        <input
          className="w-full bg-black/50 border border-neutral-700 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color-transparent)] transition-colors"
          style={
            {
              "--brand-color": THEME.primary,
              "--brand-color-transparent": hexToRgba(THEME.primary, 0.5),
            } as React.CSSProperties
          }
          value={menuName}
          onChange={(e) => {
            const next = e.target.value;
            setMenuName(next);
            debouncedUpdateName(next);
          }}
          onBlur={() => {
            debouncedUpdateName.cancel();
            const trimmed = menuName.trim();
            if (!trimmed) {
              setMenuName(deriveNameFromFilename(image.filename));
              return;
            }
            if (trimmed !== deriveNameFromFilename(image.filename)) {
              onUpdateName(trimmed);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder={t("gallery.contextMenu.imageNamePlaceholder")}
        />
      </div>

      <div className="border-t border-neutral-800 my-1"></div>

      {image.pageUrl && (
        <>
          <div className="flex justify-between">
            <div className="px-4 py-1 text-xs text-neutral-400">{t("gallery.contextMenu.linkLabel")}</div>
            <a
              href={image.pageUrl}
              className="flex items-center gap-2 px-4 py-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 truncate transition-colors"
              title={image.pageUrl}
              onClick={(e) => {
                e.preventDefault();
                const url = image.pageUrl;
                if (!url) return;
                if (window.electron?.openExternal) {
                  void window.electron.openExternal(url);
                } else {
                  window.open(url, "_blank", "noopener,noreferrer");
                }
                onClose();
              }}
            >
              <Link size={12} />
              <span className="truncate text-[10px]">
                {(() => {
                  try {
                    return new URL(image.pageUrl || "").hostname;
                  } catch {
                    return image.pageUrl;
                  }
                })()}
              </span>
            </a>
          </div>
          <div className="border-t border-neutral-800 my-1"></div>
        </>
      )}

      <div className="px-4 py-2">
        <div className="text-xs text-neutral-400 mb-1">{t("gallery.contextMenu.tagsLabel")}</div>
        <div className="relative">
          <div
            className={`flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-black/50 border rounded transition-colors cursor-text border-neutral-700`}
            style={
              {
                "--brand-color": THEME.primary,
                "--brand-color-transparent": hexToRgba(THEME.primary, 0.5),
              } as React.CSSProperties
            }
            onClick={() => menuInputRef.current?.focus()}
          >
            {ensureTags(image.tags).map((tag) => (
              <Tag
                key={tag}
                tag={tag}
                size="sm"
                isEdit={true}
                onClick={() => onRemoveTag(tag)}
              />
            ))}
            <input
              ref={menuInputRef}
              className="flex-1 bg-transparent text-white text-xs outline-none min-w-[60px] placeholder-neutral-600"
              placeholder={
                ensureTags(image.tags).length === 0
                  ? t("gallery.contextMenu.addTagPlaceholder")
                  : ""
              }
              value={menuTagInput}
              onChange={(e) => setMenuTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (menuTagInput.trim()) {
                    onAddTag(menuTagInput);
                    setMenuTagInput("");
                  }
                } else if (
                  e.key === "Backspace" &&
                  menuTagInput === "" &&
                  ensureTags(image.tags).length > 0
                ) {
                  const tags = ensureTags(image.tags);
                  onRemoveTag(tags[tags.length - 1]);
                }
              }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto bg-neutral-800 border border-neutral-700 rounded shadow-lg p-1 flex flex-wrap gap-1">
              {suggestions.map((t) => (
                <Tag
                  key={t}
                  tag={t}
                  showColor={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onAddTag(t);
                    setMenuTagInput("");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-800 my-1"></div>

      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-neutral-400">{t("gallery.contextMenu.dominantColorLabel")}</div>
          <button
            type="button"
            className="flex items-center gap-2 rounded hover:bg-neutral-800/70 px-2 py-1 transition-colors"
            onClick={(e) => {
              const rect = (
                e.currentTarget as HTMLButtonElement
              ).getBoundingClientRect();
              const next = clampPopover(rect.left, rect.bottom);
              onOpenDominantColorPicker({ x: next.x, y: next.y });
            }}
            title={dominantColor || t("common.notSet")}
          >
            <span
              className="w-4 h-4 rounded border border-neutral-700"
              style={{ backgroundColor: dominantColor || "transparent" }}
            />
            <span className="text-xs text-neutral-300">
              {dominantColor || t("common.notSet")}
            </span>
          </button>
        </div>
      </div>

      <div className="border-t border-neutral-800 my-1"></div>

      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-neutral-400">{t("gallery.contextMenu.toneLabel")}</div>
          <div className="flex items-center gap-2 px-2 py-1">
            <span
              className="w-4 h-4 rounded border border-neutral-700"
              style={{
                background:
                  image.tone && TONE_GRADIENTS[image.tone]
                    ? TONE_GRADIENTS[image.tone]
                    : "transparent",
              }}
            />
            <span className="text-xs text-neutral-300">
              {image.tone
                ? t(TONE_LABEL_KEYS[image.tone] ?? "tone.unknown")
                : t("common.notSet")}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 my-1"></div>

      <div
        className="flex items-center gap-2 px-4 py-2 text-white hover:bg-neutral-800 cursor-pointer transition-colors"
        onClick={onOpenFile}
      >
        <FolderOpen size={14} />
        <span>{t("gallery.contextMenu.showInFolder")}</span>
      </div>

      <div className="border-t border-neutral-800 my-1"></div>

      {enableVectorSearch && !image.hasVector && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-white hover:bg-neutral-800 cursor-pointer transition-colors"
          onClick={onReindex}
        >
          <RefreshCw size={14} />
          <span>{t("gallery.contextMenu.indexVector")}</span>
        </div>
      )}

      <div
        className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-900/10 cursor-pointer transition-colors"
        onClick={onDelete}
      >
        <Trash2 size={14} />
        <span>{t("gallery.contextMenu.deleteImage")}</span>
      </div>
    </div>
  );
};
