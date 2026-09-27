import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { useClickOutside } from "../hooks/useClickOutside";

type SelectOption<T extends string | number> = {
  value: T;
  label: string;
};

type CompactSelectProps<T extends string | number> = {
  ariaLabel: string;
  disabled?: boolean;
  icon?: ReactNode;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

type MenuPosition = {
  left: number;
  top: number;
  width: number;
};

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 208;
const VIEWPORT_MARGIN = 8;

export const CompactSelect = <T extends string | number>({
  ariaLabel,
  disabled = false,
  icon,
  options,
  value,
  onChange,
}: CompactSelectProps<T>) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value);

  useClickOutside([rootRef, menuRef], () => setOpen(false));

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updateMenuPosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = Math.min(options.length * 32 + 8, MENU_MAX_HEIGHT);
      const fitsBelow =
        rect.bottom + MENU_GAP + menuHeight <=
        window.innerHeight - VIEWPORT_MARGIN;
      const top = fitsBelow
        ? rect.bottom + MENU_GAP
        : Math.max(VIEWPORT_MARGIN, rect.top - MENU_GAP - menuHeight);
      setMenuPosition({
        left: Math.min(
          rect.left,
          window.innerWidth - VIEWPORT_MARGIN - rect.width,
        ),
        top,
        width: rect.width,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const moveSelection = (direction: -1 | 1) => {
    const currentIndex = options.findIndex((option) => option.value === value);
    const nextIndex = Math.min(
      options.length - 1,
      Math.max(0, currentIndex + direction),
    );
    if (nextIndex !== currentIndex) onChange(options[nextIndex].value);
  };

  return (
    <div ref={rootRef} className="relative w-48">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={clsx(
          "flex h-9 w-full items-center gap-2 rounded-xl border px-3 text-left text-xs outline-none transition-[border-color,background-color,opacity]",
          open
            ? "border-[var(--color-primary)]/70 bg-neutral-900 text-neutral-100"
            : "border-white/10 bg-neutral-950/70 text-neutral-200 hover:border-white/20 hover:bg-neutral-900/90",
          disabled && "cursor-not-allowed opacity-45",
        )}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(event.key === "ArrowDown" ? 1 : -1);
            setOpen(true);
          }
        }}
      >
        {icon && (
          <span className="shrink-0 text-neutral-600" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {selectedOption?.label}
        </span>
        <ChevronDown
          size={14}
          className={clsx(
            "shrink-0 text-neutral-500 transition-transform duration-150",
            open && "rotate-180 text-[var(--color-primary)]",
          )}
        />
      </button>

      {open &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="fixed z-[100] max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-neutral-950 p-1 shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
            style={menuPosition}
            // 菜单通过 Portal 挂在 body，阻止外层弹窗将菜单交互误判为外部点击。
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={clsx(
                    "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors",
                    selected
                      ? "bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                      : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100",
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {selected && <Check size={13} strokeWidth={2.4} />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
};
