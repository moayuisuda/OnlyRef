import React from "react";
import { X } from "lucide-react";
import { useSnapshot } from "valtio";
import { globalState } from "../store/globalStore";
import { THEME, hexToRgba } from "../theme";
import { useT } from "../i18n/useT";
import { emitOpenTagColorPicker } from "../events/uiEvents";

const getContrastTextColor = (hex: string) => {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) return "#e5e7eb";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#e5e7eb";
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 154 ? "#020617" : "#f9fafb";
};

interface TagProps extends React.HTMLAttributes<HTMLDivElement> {
  tag: string;
  size?: "sm" | "md";
  isEdit?: boolean;
  showColor?: boolean;
  showEditActions?: boolean;
  onRemove?: () => void;
}

export const TagColorDot: React.FC<{
  tag: string;
  color?: string;
  className?: string;
  size?: "sm" | "md";
}> = ({ tag, color, className, size = "sm" }) => {
  const { t } = useT();
  const normalized = typeof color === "string" ? color.trim() : "";
  const hasColor = normalized.length > 0;
  const displayColor = hasColor ? normalized : THEME.primary;

  return (
    <button
      type="button"
      className={`${
        size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5"
      } inline-flex items-center justify-center self-center p-0 border rounded-full cursor-pointer shrink-0 align-middle ${className || ""}`}
      style={{
        backgroundColor: displayColor,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        emitOpenTagColorPicker({ tag, x: e.clientX, y: e.clientY });
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
        emitOpenTagColorPicker({
          tag,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
      title={t("tag.setColor")}
      aria-label={t("tag.setColor")}
    />
  );
};

export const Tag: React.FC<TagProps> = ({
  tag,
  size = "sm",
  isEdit = false,
  showColor = true,
  showEditActions = false,
  onRemove,
  onClick,
  className,
  style,
  ...props
}) => {
  const snap = useSnapshot(globalState);
  const { t } = useT();
  const rawColor = snap.tagColors[tag];
  const normalized = typeof rawColor === "string" ? rawColor.trim() : "";
  const displayColor = normalized.length > 0 ? normalized : THEME.primary;
  const shouldShowColorDot = showColor;

  const background = hexToRgba(displayColor, 1);
  const textColor = getContrastTextColor(displayColor);
  const removeButtonSize = size === "sm" ? 10 : 12;

  // Styles
  const baseClasses =
    "relative rounded transition-colors flex items-center group/tag whitespace-nowrap";
  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-1 min-h-4"
      : "h-6 text-xs px-2";

  const interactiveClasses = onClick ? "cursor-pointer hover:text-white" : "";
  const editClasses = isEdit
    ? "group"
    : "";

  return (
    <div
      className={`${baseClasses} ${sizeClasses} ${interactiveClasses} ${editClasses} ${
        className || ""
      }`}
      style={{
        backgroundColor:
          background || (isEdit ? undefined : "rgba(38, 38, 38, 1)"),
        color: textColor,
        ...style,
      }}
      onClick={(e) => {
        if (!onClick) {
          return;
        }
        e.stopPropagation();
        onClick?.(e);
      }}
      title={tag}
      {...props}
    >
      <span>{tag}</span>

      {/* Color Indicator (Hover only) */}
      {!isEdit && shouldShowColorDot && (
        <div className="w-0 overflow-hidden group-hover/tag:w-auto transition-all duration-0">
          <TagColorDot
            tag={tag}
            color={rawColor}
            className="ml-1"
            size={size}
          />
        </div>
      )}

      {/* Remove Button & Color Indicator (Edit mode) */}
      {isEdit && (
        <div
          className={`flex items-center overflow-hidden transition-all duration-200 ${
            showEditActions ? "ml-1.5 w-auto opacity-100" : "ml-0 w-0 opacity-0"
          }`}
        >
          {shouldShowColorDot && (
            <TagColorDot
              tag={tag}
              color={rawColor}
              className="mx-1"
              size={size}
            />
          )}
          {onRemove && (
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-700/80 bg-red-950/75 text-red-200"
              title={t("common.delete")}
              aria-label={t("common.delete")}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }}
            >
              <X size={removeButtonSize} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
