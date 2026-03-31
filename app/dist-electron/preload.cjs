// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electron", {
  min: () => import_electron.ipcRenderer.send("window-min"),
  max: () => import_electron.ipcRenderer.send("window-max"),
  close: () => import_electron.ipcRenderer.send("window-close"),
  focus: () => import_electron.ipcRenderer.send("window-focus"),
  setWindowBounds: (bounds) => import_electron.ipcRenderer.send("set-window-bounds", bounds),
  setFloatingWindowMode: (enabled) => import_electron.ipcRenderer.invoke("set-floating-window-mode", enabled),
  setToggleWindowShortcut: (accelerator) => import_electron.ipcRenderer.invoke("set-toggle-window-shortcut", accelerator),
  onRendererEvent: (callback) => {
    const handler = (_, event, ...args) => callback(event, ...args);
    import_electron.ipcRenderer.on("renderer-event", handler);
    return () => import_electron.ipcRenderer.off("renderer-event", handler);
  },
  setSettingsOpen: (open) => import_electron.ipcRenderer.send("settings-open-changed", open),
  getStorageDir: () => import_electron.ipcRenderer.invoke("get-storage-dir"),
  openStorageDir: () => import_electron.ipcRenderer.invoke("open-storage-dir"),
  chooseStorageDir: () => import_electron.ipcRenderer.invoke("choose-storage-dir"),
  openExternal: (url) => import_electron.ipcRenderer.invoke("open-external", url),
  onImageUpdated: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("image-updated", handler);
    return () => import_electron.ipcRenderer.off("image-updated", handler);
  },
  onSearchUpdated: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("search-updated", handler);
    return () => import_electron.ipcRenderer.off("search-updated", handler);
  },
  onEnvInitProgress: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("env-init-progress", handler);
    return () => import_electron.ipcRenderer.off("env-init-progress", handler);
  },
  onIndexingProgress: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("indexing-progress", handler);
    return () => import_electron.ipcRenderer.off("indexing-progress", handler);
  },
  onToast: (callback) => {
    const handler = (_, data) => callback(data);
    import_electron.ipcRenderer.on("toast", handler);
    return () => import_electron.ipcRenderer.off("toast", handler);
  },
  log: (level, ...args) => import_electron.ipcRenderer.send("log-message", level, ...args),
  getLogContent: () => import_electron.ipcRenderer.invoke("get-log-content")
});
