import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { globalActions } from './store/globalStore.ts'
import { i18nActions } from './store/i18nStore.ts'
import { actions as galleryActions } from './store/galleryStore.ts'
import { canvasActions } from './store/canvasStore.ts'

// Global error handlers
window.addEventListener('error', (event) => {
  const message = event.message || 'Unknown error';
  const source = event.filename;
  const lineno = event.lineno;
  const colno = event.colno;
  const error = event.error;

  console.error('Global error:', event);
  window.electron?.log?.('error', 'Global error:', message, `at ${source}:${lineno}:${colno}`, error);
  globalActions.pushToast({ key: 'toast.globalError', params: { message } }, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  window.electron?.log?.('error', 'Unhandled rejection:', event.reason);
  globalActions.pushToast(
    { key: 'toast.unhandledRejection', params: { reason: String(event.reason) } },
    'error',
  );
});

const renderApp = () => {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('Root element not found');

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
};

const bootstrap = async () => {
  await Promise.all([
    i18nActions.hydrate(),
    globalActions.hydrateSettings(),
    galleryActions.hydrateSettings(),
    canvasActions.hydrateSettings(),
  ]);

  window.electron?.setPinMode?.(true, 0);
};

void bootstrap()
  .catch((err) => {
    console.error('Failed to bootstrap app:', err);
  })
  .finally(() => {
    renderApp();
  });
