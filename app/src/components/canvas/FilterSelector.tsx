import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useT } from "../../i18n/useT";
import { AVAILABLE_FILTERS } from "../../utils/imageFilters";
import { clsx } from "clsx";
import { THEME, hexToRgba } from "../../theme";
import type { I18nKey } from "../../../shared/i18n/types";

interface FilterSelectorProps {
  activeFilters: readonly string[];
  onChange: (filters: string[]) => void;
  customTrigger?: (isOpen: boolean) => React.ReactNode;
}

export const FilterSelector: React.FC<FilterSelectorProps> = ({
  activeFilters,
  onChange,
  customTrigger,
}) => {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const brandBackground = hexToRgba(THEME.primary, 0.2);
  const brandBackgroundStrong = hexToRgba(THEME.primary, 0.35);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggleFilter = (filterId: string) => {
    if (activeFilters.includes(filterId)) {
      onChange(activeFilters.filter((f) => f !== filterId));
    } else {
      onChange([...activeFilters, filterId]);
    }
  };

  return (
    <div
      className="relative"
      ref={containerRef}
      style={
        {
          "--brand-color": THEME.primary,
          "--brand-color-weak": brandBackground ?? THEME.primary,
          "--brand-color-strong": brandBackgroundStrong ?? THEME.primary,
        } as React.CSSProperties
      }
    >
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {customTrigger ? (
          customTrigger(isOpen)
        ) : (
          <button
            className={clsx(
              "glass-btn w-full",
              activeFilters.length > 0 && "glass-btn--active"
            )}
            title={t("canvas.toolbar.filters")}
            // Note: onClick is handled by parent div to support non-button custom triggers properly
          >
            <span>{t("canvas.toolbar.filters")}</span>
            {activeFilters.length > 0 && (
              <span className="bg-(--brand-color-strong) text-(--brand-color) text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                {activeFilters.length}
              </span>
            )}
            <ChevronDown size={12} className={clsx("transition-transform duration-200", isOpen && "rotate-180")} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-neutral-900/90 border border-neutral-700/80 rounded-lg shadow-xl py-1.5 z-50 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
          {AVAILABLE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => handleToggleFilter(filter.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 flex items-center justify-between group"
            >
              <span>{t(filter.name as I18nKey)}</span>
              {activeFilters.includes(filter.id) && (
                <Check size={12} className="text-(--brand-color)" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
