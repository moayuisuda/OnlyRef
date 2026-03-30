/// <reference types="vite/client" />

interface Window {
  electron?: {
    min: () => void;
    max: () => void;
    close: () => void;
    focus: () => void;
    toggleAlwaysOnTop: (flag: boolean) => void;
    setPinMode: (enabled: boolean, widthDelta: number) => void;
    setPinTransparent: (enabled: boolean) => void;
    resizeWindowBy: (delta: number) => void;
    setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) => void;
    setToggleWindowShortcut: (
      accelerator: string,
    ) => Promise<{ success: boolean; error?: string; accelerator?: string }>;
    setToggleMouseThroughShortcut: (
      accelerator: string,
    ) => Promise<{ success: boolean; error?: string; accelerator?: string }>;
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
    setSettingsOpen: (open: boolean) => void;
    onImageUpdated: (callback: (data: unknown) => void) => () => void;
    onSearchUpdated: (callback: (data: unknown) => void) => () => void;
    onModelDownloadProgress: (callback: (data: unknown) => void) => () => void;
    onEnvInitProgress: (callback: (data: unknown) => void) => () => void;
    onIndexingProgress: (callback: (data: unknown) => void) => () => void;
    onToast: (callback: (data: unknown) => void) => () => void;
    onRendererEvent: (callback: (channel: string, data: unknown) => void) => () => void;
    getStorageDir: () => Promise<string>;
    chooseStorageDir: () => Promise<string | null>;
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    log: (level: string, ...args: unknown[]) => void;
    getLogContent: () => Promise<string>;
    ensureModelReady: () => Promise<{ success: boolean; error?: string }>;
  };
}
