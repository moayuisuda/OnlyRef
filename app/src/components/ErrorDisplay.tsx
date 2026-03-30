import { useEffect, useState } from 'react';
import { globalActions } from '../store/globalStore';
import { useT } from '../i18n/useT';

export const ErrorDisplay = ({ error }: { error: Error | null }) => {
  const { t } = useT();
  const [logState, setLogState] = useState<
    | { state: 'loading' }
    | { state: 'unavailable' }
    | { state: 'error'; message: string }
    | { state: 'ready'; content: string }
  >({ state: 'loading' });

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        if (window.electron?.getLogContent) {
          const content = await window.electron.getLogContent();
          setLogState({ state: 'ready', content });
        } else {
          setLogState({ state: 'unavailable' });
        }
      } catch (err) {
        setLogState({
          state: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void fetchLogs();
  }, []);

  const logContent = logState.state === 'ready' ? logState.content : '';
  const logText =
    logState.state === 'ready'
      ? logState.content
      : logState.state === 'unavailable'
        ? t('errors.logAccessUnavailable')
        : logState.state === 'error'
          ? t('errors.failedToLoadLogs', { message: logState.message })
          : t('errors.loadingLogs');

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-neutral-950 text-white p-8">
      <div className="flex flex-col w-full max-w-4xl max-h-full bg-neutral-900 rounded-lg border border-neutral-800 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-neutral-800 flex-shrink-0">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-danger)' }}>
            {t('errors.title')}
          </h1>
          <p className="text-neutral-400 text-sm">
            {error?.message || t('errors.unexpected')}
          </p>
        </div>
        
        <div className="flex-1 p-4 bg-black/50 overflow-hidden flex flex-col min-h-0">
          <div className="text-xs text-neutral-500 mb-2 uppercase tracking-wider font-semibold">
            {t('errors.applicationLogTitle')}
          </div>
          <pre className="flex-1 overflow-auto font-mono text-xs text-neutral-300 whitespace-pre-wrap break-all p-2 rounded bg-neutral-950/50 border border-neutral-800/50">
            {logText}
          </pre>
        </div>

        <div className="p-4 border-t border-neutral-800 bg-neutral-900 flex justify-end gap-3 flex-shrink-0">
          <button
            className="px-4 py-2 rounded transition-colors text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-white"
            onClick={() => {
              navigator.clipboard.writeText(logContent).then(() => {
                globalActions.pushToast({ key: 'toast.logCopied' }, 'success');
              }).catch(() => {
                globalActions.pushToast({ key: 'toast.logCopyFailed' }, 'error');
              });
            }}
          >
            {t('errors.copyLog')}
          </button>
          <button 
            className="px-4 py-2 rounded transition-colors text-sm font-medium text-neutral-950 font-bold hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
            onClick={() => window.location.reload()}
          >
            {t('errors.reloadApplication')}
          </button>
        </div>
      </div>
    </div>
  );
};
