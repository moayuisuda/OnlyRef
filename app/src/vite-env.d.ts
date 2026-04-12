/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    electron?: {
      min: () => void;
      max: () => void;
      close: () => void;
      focus: () => void;
      setWindowBounds: (bounds: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }) => void;
      setWindowAlwaysOnTop: (
        alwaysOnTop: boolean,
      ) => Promise<{ success: boolean; error?: string; alwaysOnTop: boolean }>;
      setToggleWindowShortcut: (
        accelerator: string,
      ) => Promise<{ success: boolean; error?: string; accelerator?: string }>;
      setSettingsOpen: (open: boolean) => void;
      onImageUpdated: (callback: (data: unknown) => void) => () => void;
      onSearchUpdated: (callback: (data: unknown) => void) => () => void;
      onEnvInitProgress: (callback: (data: unknown) => void) => () => void;
      onIndexingProgress: (callback: (data: unknown) => void) => () => void;
      onToast: (callback: (data: unknown) => void) => () => void;
      onRendererEvent: (callback: (channel: string, ...args: unknown[]) => void) => () => void;
      getEnvInitProgress: () => Promise<unknown>;
      hasPersistedStorageRoot: () => Promise<boolean>;
      getStorageDir: () => Promise<string>;
      openStorageDir: () => Promise<{ success: boolean; error?: string }>;
      chooseStorageDir: () => Promise<string | null>;
      chooseInitialStorageDir: () => Promise<string | null>;
      chooseSearchImage: () => Promise<{ path: string; name: string } | null>;
      startImageDrag: (payload: {
        imagePath: string;
        fallbackIconPath?: string;
      }) => Promise<{ success: boolean; error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      log: (level: string, ...args: unknown[]) => void;
      getLogContent: () => Promise<string>;
    };
  }
}
