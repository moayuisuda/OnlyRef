import React from "react";
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
}

const TagColorDot: React.FC<{
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
      } border rounded-full cursor-pointer shrink-0 ${className || ""}`}
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
  onClick,
  className,
  style,
  ...props
}) => {
  const snap = useSnapshot(globalState);
  const rawColor = snap.tagColors[tag];
  const normalized = typeof rawColor === "string" ? rawColor.trim() : "";
  const displayColor = normalized.length > 0 ? normalized : THEME.primary;
  const shouldShowColorDot = showColor;

  const background = hexToRgba(displayColor, 1);
  const textColor = getContrastTextColor(displayColor);

  const baseClasses =
    "group/tag relative inline-flex items-center whitespace-nowrap rounded-full border transition-all duration-200";
  const sizeClasses =
    size === "sm"
      ? "min-h-5 gap-1 px-1.5 text-[10px]"
      : "min-h-7 gap-1.5 px-2.5 text-[11px]";

  const interactiveClasses = onClick ? "cursor-pointer hover:-translate-y-px" : "";
  const editClasses = isEdit
    ? "hover:border-red-300/20 hover:bg-red-400/10 hover:text-red-100"
    : "";

  return (
    <div
      className={`${baseClasses} ${sizeClasses} ${interactiveClasses} ${editClasses} ${
        className || ""
      }`}
      style={{
        backgroundColor:
          background || "rgba(255, 255, 255, 0.045)",
        borderColor: background ? "rgba(255, 255, 255, 0.18)" : "rgba(148, 163, 184, 0.12)",
        color: textColor,
        boxShadow: background ? "inset 0 1px 0 rgba(255,255,255,0.12)" : undefined,
        ...style,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      title={tag}
      {...props}
    >
      <span className="truncate max-w-[12rem]">{tag}</span>

      {!isEdit && shouldShowColorDot && (
        <div className="w-0 overflow-hidden transition-all duration-150 group-hover/tag:w-auto">
          <TagColorDot
            tag={tag}
            color={rawColor}
            className="ml-1"
            size={size}
          />
        </div>
      )}

      {isEdit && (
        <div className="flex w-0 items-center overflow-hidden transition-all duration-200 group-hover:w-auto">
          {shouldShowColorDot && (
            <TagColorDot
              tag={tag}
              color={rawColor}
              className="mx-1 opacity-0 transition-opacity group-hover:opacity-100"
              size={size}
            />
          )}
        </div>
      )}
    </div>
  );
};
