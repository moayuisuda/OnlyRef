import React from 'react';
import { useSnapshot } from 'valtio';
import { envInitState } from '../store/globalStore';
import { useT } from '../i18n/useT';

export const EnvInitModal: React.FC = () => {
  const snap = useSnapshot(envInitState);
  const { t } = useT();

  if (!snap.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] bg-[#0b0d10] border border-white/10 rounded-xl p-6 shadow-2xl">
        <h1 className="font-semibold text-4xl mb-4 text-primary">{t('envInit.brandTitle')}</h1>
        <h2 className="text-white font-semibold text-lg mb-2">
          {t('envInit.heading')}
        </h2>
        <div className="text-white/60 text-sm mb-4">
          {t('envInit.subheading')}
        </div>

        <div className="relative h-2.5 w-full bg-white/10 rounded-full overflow-hidden mb-3">
          <div
            className="absolute top-0 left-0 h-full bg-[#39C5BB] transition-all duration-200 ease-linear rounded-full"
            style={{ width: `${snap.progress * 100}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-xs">
          <div className="text-white/70 font-mono truncate max-w-[380px]">
            {t(snap.statusKey, snap.statusParams)}
          </div>
          <div className="text-[#39C5BB] font-medium tabular-nums">
            {snap.percentText}
          </div>
        </div>
      </div>
    </div>
  );
};
