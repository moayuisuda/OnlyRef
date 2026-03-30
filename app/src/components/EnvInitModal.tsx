import React from 'react';
import { useSnapshot } from 'valtio';
import { envInitState } from '../store/globalStore';
import { useT } from '../i18n/useT';

export const EnvInitModal: React.FC = () => {
  const snap = useSnapshot(envInitState);
  const { t } = useT();

  if (!snap.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,9,11,0.6)] backdrop-blur-md">
      <div className="surface-panel-strong relative w-[520px] overflow-hidden rounded-[1.75rem] p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[rgba(57,197,187,0.1)] to-transparent" />
        <div className="mb-5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-400 w-fit">
          Initial Setup
        </div>
        <h1 className="mb-4 font-[var(--font-display)] text-4xl text-primary">
          {t("envInit.brandTitle")}
        </h1>
        <h2 className="mb-2 text-lg font-semibold text-white">
          {t('envInit.heading')}
        </h2>
        <div className="mb-5 text-sm leading-6 text-white/60">
          {t('envInit.subheading')}
        </div>

        <div className="mb-3 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-2.5 rounded-full bg-[#39C5BB] transition-all duration-200 ease-linear"
            style={{ width: `${snap.progress * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-4 text-xs">
          <div className="max-w-[380px] truncate text-white/70">
            {t(snap.statusKey, snap.statusParams)}
          </div>
          <div className="rounded-full border border-[rgba(57,197,187,0.2)] bg-[rgba(57,197,187,0.12)] px-2.5 py-1 font-medium tabular-nums text-[#8de5de]">
            {snap.percentText}
          </div>
        </div>
      </div>
    </div>
  );
};
