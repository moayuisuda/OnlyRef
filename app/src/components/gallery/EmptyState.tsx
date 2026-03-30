import React from "react";
import { FolderOpen } from "lucide-react";
import { THEME, hexToRgba } from "../../theme";
import { useT } from "../../i18n/useT";

export const GalleryEmptyState: React.FC = () => {
  const { t } = useT();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 select-none">
      <div
        className="surface-panel group relative flex w-full max-w-xl flex-col items-center justify-center overflow-hidden rounded-[2rem] px-10 py-14 text-neutral-500 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--brand-color-40)] hover:bg-[var(--brand-color-5)]"
        style={
          {
            "--brand-color-40": hexToRgba(THEME.primary, 0.4),
            "--brand-color-5": hexToRgba(THEME.primary, 0.05),
            "--brand-color-30": hexToRgba(THEME.primary, 0.3),
            "--brand-color": THEME.primary,
          } as React.CSSProperties
        }
      >
        <div className="pointer-events-none absolute inset-x-[12%] top-0 h-32 rounded-b-full bg-[var(--brand-color-5)] blur-2xl" />

        <div className="relative mb-8">
          <div className="absolute inset-0 scale-150 rounded-full bg-[var(--brand-color)] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-15" />
          <FolderOpen
            size={72}
            className="relative z-10 text-neutral-700 transition-colors duration-300 group-hover:text-[var(--brand-color)]"
            strokeWidth={1.2}
          />
        </div>

        <div className="mb-3 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-500">
          Reference Library
        </div>

        <h1 className="mb-3 font-[var(--font-display)] text-[2rem] tracking-[0.01em] text-neutral-200 transition-colors group-hover:text-white">
          {t("envInit.brandTitle")}
        </h1>

        <p className="mb-8 max-w-[320px] text-center text-sm leading-7 text-neutral-400 transition-colors group-hover:text-neutral-300">
          {t("gallery.empty.bodyLine1")}
          <br />
          {t("gallery.empty.bodyLine2")}
        </p>

        <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-5 py-2.5 text-xs font-medium text-neutral-400 transition-all group-hover:border-[var(--brand-color-30)] group-hover:bg-[var(--brand-color-5)] group-hover:text-[var(--brand-color)]">
          <span className="text-[10px] uppercase tracking-[0.18em]">
            {t("gallery.empty.dragHint")}
          </span>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-neutral-600">
        <div className="h-px w-10 bg-white/8" />
        <div>OnlyRef</div>
        <div className="h-px w-10 bg-white/8" />
      </div>
      <div className="mt-3 max-w-[280px] text-center text-[11px] leading-5 text-neutral-600">
        Built for quiet browsing, fast sorting, and focused reference review.
      </div>
    </div>
  );
};
