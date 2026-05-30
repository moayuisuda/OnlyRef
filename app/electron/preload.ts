import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  min: () => ipcRenderer.send('window-min'),
  max: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  closeCurrentWindow: () => ipcRenderer.send('close-current-window'),
  focus: () => ipcRenderer.send('window-focus'),
  setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) =>
    ipcRenderer.send('set-window-bounds', bounds),
  setWindowAlwaysOnTop: (alwaysOnTop: boolean) =>
    ipcRenderer.invoke('set-window-always-on-top', alwaysOnTop),
  setToggleWindowShortcut: (accelerator: string) =>
    ipcRenderer.invoke('set-toggle-window-shortcut', accelerator),
  onRendererEvent: (callback: (event: string, ...args: unknown[]) => void) => {
    const handler = (_: unknown, event: string, ...args: unknown[]) => callback(event, ...args);
    ipcRenderer.on('renderer-event', handler);
    return () => ipcRenderer.off('renderer-event', handler);
  },
  setSettingsOpen: (open: boolean) => ipcRenderer.send('settings-open-changed', open),
  getStorageDir: () => ipcRenderer.invoke('get-storage-dir'),
  openStorageDir: () => ipcRenderer.invoke('open-storage-dir'),
  chooseStorageDir: () => ipcRenderer.invoke('choose-storage-dir'),
  chooseInitialStorageDir: () => ipcRenderer.invoke('choose-initial-storage-dir'),
  chooseSearchImage: () => ipcRenderer.invoke('choose-search-image'),
  openGalleryPreviewWindow: (payload: {
    images: { id: string; filename: string; imagePath: string }[];
    activeImageId: string;
  }) => ipcRenderer.invoke('open-gallery-preview-window', payload),
  getGalleryPreviewData: () => ipcRenderer.invoke('get-gallery-preview-data'),
  searchMainWindowByImage: (payload: {
    imageId: string;
    previewUrl: string;
    previewName: string;
  }) => ipcRenderer.invoke('search-main-window-by-image', payload),
  startImageDrag: (payload: { imagePath: string; fallbackIconPath?: string }) =>
    ipcRenderer.invoke('start-image-drag', payload),
  getEnvInitProgress: () => ipcRenderer.invoke('get-env-init-progress'),
  hasPersistedStorageRoot: () => ipcRenderer.invoke('has-persisted-storage-root'),
  getUpdaterState: () => ipcRenderer.invoke('get-updater-state'),
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update'),
  quitAndInstallAppUpdate: () => ipcRenderer.invoke('quit-and-install-app-update'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onImageUpdated: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('image-updated', handler);
    return () => ipcRenderer.off('image-updated', handler);
  },
  onSearchUpdated: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('search-updated', handler);
    return () => ipcRenderer.off('search-updated', handler);
  },
  onEnvInitProgress: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('env-init-progress', handler);
    return () => ipcRenderer.off('env-init-progress', handler);
  },
  onIndexingProgress: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('indexing-progress', handler);
    return () => ipcRenderer.off('indexing-progress', handler);
  },
  onToast: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('toast', handler);
    return () => ipcRenderer.off('toast', handler);
  },
  onUpdaterState: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('updater-state', handler);
    return () => ipcRenderer.off('updater-state', handler);
  },
  log: (level: string, ...args: unknown[]) => ipcRenderer.send('log-message', level, ...args),
  getLogContent: () => ipcRenderer.invoke('get-log-content'),
});
