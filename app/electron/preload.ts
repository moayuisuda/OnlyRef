import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  min: () => ipcRenderer.send('window-min'),
  max: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  focus: () => ipcRenderer.send('window-focus'),
  toggleAlwaysOnTop: (flag: boolean) => ipcRenderer.send('toggle-always-on-top', flag),
  setPinMode: (enabled: boolean, widthDelta: number) => ipcRenderer.send('set-pin-mode', { enabled, widthDelta }),
  setPinTransparent: (enabled: boolean) => ipcRenderer.send('set-pin-transparent', enabled),
  resizeWindowBy: (delta: number) => ipcRenderer.send('resize-window-by', delta),
  setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) =>
    ipcRenderer.send('set-window-bounds', bounds),
  setToggleWindowShortcut: (accelerator: string) =>
    ipcRenderer.invoke('set-toggle-window-shortcut', accelerator),
  setToggleMouseThroughShortcut: (accelerator: string) =>
    ipcRenderer.invoke('set-toggle-mouse-through-shortcut', accelerator),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  onRendererEvent: (callback: (event: string, ...args: unknown[]) => void) => {
    const handler = (_: unknown, event: string, ...args: unknown[]) => callback(event, ...args);
    ipcRenderer.on('renderer-event', handler);
    return () => ipcRenderer.off('renderer-event', handler);
  },
  setSettingsOpen: (open: boolean) => ipcRenderer.send('settings-open-changed', open),
  getStorageDir: () => ipcRenderer.invoke('get-storage-dir'),
  chooseStorageDir: () => ipcRenderer.invoke('choose-storage-dir'),
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
  onModelDownloadProgress: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('model-download-progress', handler);
    return () => ipcRenderer.off('model-download-progress', handler);
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
  log: (level: string, ...args: unknown[]) => ipcRenderer.send('log-message', level, ...args),
  getLogContent: () => ipcRenderer.invoke('get-log-content'),
  ensureModelReady: () => ipcRenderer.invoke('ensure-model-ready'),
});
