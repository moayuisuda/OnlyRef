import React from "react";
import { FolderOpen } from "lucide-react";
import { THEME, hexToRgba } from "../../theme";
import { useT } from "../../i18n/useT";

export const GalleryEmptyState: React.FC = () => {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center h-full m-4 select-none">
      <div
        className="group flex flex-col items-center justify-center w-full max-w-md p-12 border-2 border-dashed border-neutral-800 rounded-3xl bg-neutral-900/30 text-neutral-500 transition-all duration-300 hover:border-[var(--brand-color-40)] hover:bg-[var(--brand-color-5)] hover:scale-[1.02] hover:shadow-2xl hover:shadow-[var(--brand-color-5)]"
        style={
          {
            "--brand-color-40": hexToRgba(THEME.primary, 0.4),
            "--brand-color-5": hexToRgba(THEME.primary, 0.05),
            "--brand-color-30": hexToRgba(THEME.primary, 0.3),
            "--brand-color": THEME.primary,
          } as React.CSSProperties
        }
      >
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-[var(--brand-color)] blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-full transform scale-150" />
          <FolderOpen
            size={72}
            className="relative z-10 text-neutral-700 group-hover:text-[var(--brand-color)] transition-colors duration-300"
            strokeWidth={1.2}
          />
        </div>

        <h1 className="text-2xl font-bold text-neutral-300 mb-3 group-hover:text-white transition-colors tracking-tight">
          {t("envInit.brandTitle")}
        </h1>

        <p className="text-neutral-500 text-sm mb-8 text-center max-w-[240px] leading-relaxed group-hover:text-neutral-400 transition-colors">
          {t("gallery.empty.bodyLine1")}
          <br />
          {t("gallery.empty.bodyLine2")}
        </p>

        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-neutral-800/50 border border-neutral-700/50 text-xs font-medium text-neutral-400 group-hover:border-[var(--brand-color-30)] group-hover:text-[var(--brand-color)] group-hover:bg-[var(--brand-color-5)] transition-all">
          <span className="uppercase tracking-wide text-[10px]">
            {t("gallery.empty.dragHint")}
          </span>
        </div>
      </div>

      <div className="mt-12 flex flex-col items-center gap-2 opacity-40 hover:opacity-80 transition-opacity">
        <div className="h-px w-12 bg-neutral-700" />
        <div className="text-neutral-500 text-[10px] font-mono tracking-[0.2em] uppercase">
          LookBack
        </div>
      </div>
    </div>
  );
};
