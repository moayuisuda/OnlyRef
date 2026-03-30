import { proxy } from 'valtio';
import { THEME } from '../theme';
import { settingStorage, getSettingsSnapshot, readSetting } from '../service';
import type { I18nKey, I18nMessage, I18nParams } from '../../shared/i18n/types';

export interface EnvInitState {
  isOpen: boolean;
  progress: number; // 0 to 1
  statusKey: I18nKey;
  statusParams?: I18nParams;
  percentText: string;
}

export const envInitState = proxy<EnvInitState>({
  isOpen: false,
  progress: 0,
  statusKey: 'envInit.preparing',
  percentText: '0%',
});

export interface IndexingState {
  isIndexing: boolean;
  current: number;
  total: number;
  statusKey: I18nKey | null;
  statusParams?: I18nParams;
  filename?: string;
}

export const indexingState = proxy<IndexingState>({
  isIndexing: false,
  current: 0,
  total: 0,
  statusKey: null,
});

export interface ModelProgressState {
  isDownloading: boolean;
  current: number;
  total: number;
  statusKey: I18nKey | null;
  statusParams?: I18nParams;
  filename?: string;
}

export const modelProgressState = proxy<ModelProgressState>({
  isDownloading: false,
  current: 0,
  total: 0,
  statusKey: null,
});

export const indexingActions = {
  update: (data: Partial<IndexingState>) => {
    Object.assign(indexingState, data);
  },
  reset: () => {
    indexingState.isIndexing = false;
    indexingState.current = 0;
    indexingState.total = 0;
    indexingState.statusKey = null;
    indexingState.statusParams = undefined;
    indexingState.filename = undefined;
  },
};

export const modelProgressActions = {
  update: (data: Partial<ModelProgressState>) => {
    Object.assign(modelProgressState, data);
  },
  reset: () => {
    modelProgressState.isDownloading = false;
    modelProgressState.current = 0;
    modelProgressState.total = 0;
    modelProgressState.statusKey = null;
    modelProgressState.statusParams = undefined;
    modelProgressState.filename = undefined;
  },
};

export const envInitActions = {
  update: (data: Partial<EnvInitState>) => {
    Object.assign(envInitState, data);
  },
  reset: () => {
    envInitState.isOpen = false;
    envInitState.progress = 0;
    envInitState.statusKey = 'envInit.preparing';
    envInitState.statusParams = undefined;
    envInitState.percentText = '0%';
  },
};

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  message: I18nMessage;
  type: ToastType;
  createdAt: number;
};

export type ActiveArea = 'gallery' | 'canvas' | null;

export interface GlobalState {
  tagColors: Record<string, string>;
  colorSwatches: string[];
  toasts: Toast[];
  pinMode: boolean;
  pinTransparent: boolean;
  toggleWindowShortcut: string;
  canvasOpacity: number;
  mouseThrough: boolean;
  canvasOpacityUpShortcut: string;
  canvasOpacityDownShortcut: string;
  toggleMouseThroughShortcut: string;
  toggleGalleryShortcut: string;
  canvasGroupShortcut: string;
  sidebarWidth: number;
  activeArea: ActiveArea;
  isGalleryOpen: boolean;
  enableVectorSearch: boolean;
  llmSettings: LLMSettings;
  isAppHidden: boolean;
}

export interface LLMSettings {
  enabled: boolean;
  baseUrl: string;
  key: string;
  model: string;
}

const DEFAULT_COLOR_SWATCHES = [
  '#a855f7',
  '#3b82f6',
  '#06b6d4',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#94a3b8',
  '#ffffff',
  '#0f172a',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isHexColor = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return (
    /^#[0-9a-fA-F]{6}$/.test(value.trim()) ||
    /^#[0-9a-fA-F]{3}$/.test(value.trim())
  );
};

const normalizeHexColor = (value: string): string => {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return THEME.primary;
};

const ensureSidebarWidth = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return 320;
  }
  return value;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

const DEFAULT_TOGGLE_WINDOW_SHORTCUT = isMac ? 'Command+L' : 'Ctrl+L';
const DEFAULT_CANVAS_OPACITY_UP_SHORTCUT = isMac ? 'Command+Up' : 'Ctrl+Up';
const DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT = isMac ? 'Command+Down' : 'Ctrl+Down';
const DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT = isMac ? 'Command+T' : 'Ctrl+T';
const DEFAULT_TOGGLE_GALLERY_SHORTCUT = isMac ? 'Command+B' : 'Ctrl+B';
const DEFAULT_CANVAS_GROUP_SHORTCUT = isMac ? 'Command+G' : 'Ctrl+G';

export const globalState = proxy<GlobalState>({
  tagColors: {},
  colorSwatches: [...DEFAULT_COLOR_SWATCHES],
  toasts: [],
  pinMode: true,
  pinTransparent: true,
  toggleWindowShortcut: DEFAULT_TOGGLE_WINDOW_SHORTCUT,
  canvasOpacity: 1,
  mouseThrough: false,
  canvasOpacityUpShortcut: DEFAULT_CANVAS_OPACITY_UP_SHORTCUT,
  canvasOpacityDownShortcut: DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT,
  toggleMouseThroughShortcut: DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT,
  toggleGalleryShortcut: DEFAULT_TOGGLE_GALLERY_SHORTCUT,
  canvasGroupShortcut: DEFAULT_CANVAS_GROUP_SHORTCUT,
  sidebarWidth: 320,
  activeArea: null,
  isGalleryOpen: true,
  enableVectorSearch: false,
  llmSettings: {
    enabled: false,
    baseUrl: '',
    key: '',
    model: '',
  },
  isAppHidden: false,
});

export const globalActions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawTagColors = readSetting<Record<string, unknown>>(settings, 'tagColors', {});
      const rawColorSwatches = readSetting<unknown>(
        settings,
        'colorSwatches',
        [...DEFAULT_COLOR_SWATCHES],
      );
      const rawSidebarWidth = readSetting<unknown>(settings, 'sidebarWidth', 320);
      const rawToggleWindowShortcut = readSetting<unknown>(
        settings,
        'toggleWindowShortcut',
        DEFAULT_TOGGLE_WINDOW_SHORTCUT,
      );
      const rawCanvasOpacity = readSetting<unknown>(settings, 'canvasOpacity', 1);
      const rawMouseThrough = readSetting<unknown>(settings, 'mouseThrough', false);
      const rawCanvasOpacityUpShortcut = readSetting<unknown>(
        settings,
        'canvasOpacityUpShortcut',
        DEFAULT_CANVAS_OPACITY_UP_SHORTCUT,
      );
      const rawCanvasOpacityDownShortcut = readSetting<unknown>(
        settings,
        'canvasOpacityDownShortcut',
        DEFAULT_CANVAS_OPACITY_DOWN_SHORTCUT,
      );
      const rawToggleMouseThroughShortcut = readSetting<unknown>(
        settings,
        'toggleMouseThroughShortcut',
        DEFAULT_TOGGLE_MOUSE_THROUGH_SHORTCUT,
      );
      const rawToggleGalleryShortcut = readSetting<unknown>(
        settings,
        'toggleGalleryShortcut',
        DEFAULT_TOGGLE_GALLERY_SHORTCUT,
      );
      const rawCanvasGroupShortcut = readSetting<unknown>(
        settings,
        'canvasGroupShortcut',
        DEFAULT_CANVAS_GROUP_SHORTCUT,
      );
      const rawIsGalleryOpen = readSetting<unknown>(settings, 'isGalleryOpen', true);
      const rawLlmSettings = readSetting<unknown>(settings, 'llmSettings', {});

      const nextTagColors: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawTagColors)) {
        if (typeof k === 'string' && typeof v === 'string' && k.trim()) {
          nextTagColors[k] = v;
        }
      }
      globalState.tagColors = nextTagColors;

      let swatches: string[] = [];
      if (Array.isArray(rawColorSwatches)) {
        swatches = rawColorSwatches
          .filter(isHexColor)
          .map((c) => normalizeHexColor(c));
      }
      if (swatches.length === 0) {
        swatches = [...DEFAULT_COLOR_SWATCHES];
      }
      globalState.colorSwatches = swatches.slice(0, DEFAULT_COLOR_SWATCHES.length);

      globalState.sidebarWidth = ensureSidebarWidth(rawSidebarWidth);

      globalState.pinTransparent = true;
      globalState.pinMode = true;
      void settingStorage.set('pinTransparent', true);
      void settingStorage.set('pinMode', true);

      if (typeof rawToggleWindowShortcut === 'string' && rawToggleWindowShortcut.trim()) {
        globalState.toggleWindowShortcut = rawToggleWindowShortcut.trim();
      }

      if (typeof rawCanvasOpacity === 'number') {
        globalState.canvasOpacity = rawCanvasOpacity;
      }

      if (typeof rawMouseThrough === 'boolean') {
        globalState.mouseThrough = rawMouseThrough;
      }

      if (typeof rawCanvasOpacityUpShortcut === 'string' && rawCanvasOpacityUpShortcut.trim()) {
        globalState.canvasOpacityUpShortcut = rawCanvasOpacityUpShortcut.trim();
      }

      if (typeof rawCanvasOpacityDownShortcut === 'string' && rawCanvasOpacityDownShortcut.trim()) {
        globalState.canvasOpacityDownShortcut = rawCanvasOpacityDownShortcut.trim();
      }

      if (typeof rawToggleMouseThroughShortcut === 'string' && rawToggleMouseThroughShortcut.trim()) {
        globalState.toggleMouseThroughShortcut = rawToggleMouseThroughShortcut.trim();
      }

      if (typeof rawToggleGalleryShortcut === 'string' && rawToggleGalleryShortcut.trim()) {
        globalState.toggleGalleryShortcut = rawToggleGalleryShortcut.trim();
      }

      if (typeof rawCanvasGroupShortcut === 'string' && rawCanvasGroupShortcut.trim()) {
        globalState.canvasGroupShortcut = rawCanvasGroupShortcut.trim();
      }

      if (typeof rawIsGalleryOpen === 'boolean') {
        globalState.isGalleryOpen = rawIsGalleryOpen;
      }

      if (isRecord(rawLlmSettings)) {
        globalState.llmSettings = {
          enabled: typeof rawLlmSettings.enabled === 'boolean' ? (rawLlmSettings.enabled as boolean) : false,
          baseUrl: typeof rawLlmSettings.baseUrl === 'string' ? (rawLlmSettings.baseUrl as string) : '',
          key: typeof rawLlmSettings.key === 'string' ? (rawLlmSettings.key as string) : '',
          model: typeof rawLlmSettings.model === 'string' ? (rawLlmSettings.model as string) : '',
        };
      }
    } catch (error) {
      console.error('Failed to hydrate settings:', error);
    }
  },

  pushToast: (message: I18nMessage, type: ToastType = 'info', timeoutMs = 3200) => {
    const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    globalState.toasts = [
      ...globalState.toasts,
      { id, message, type, createdAt: Date.now() },
    ];
    if (timeoutMs > 0) {
      window.setTimeout(() => {
        globalActions.removeToast(id);
      }, timeoutMs);
    }
  },

  removeToast: (id: string) => {
    globalState.toasts = globalState.toasts.filter((t) => t.id !== id);
  },

  setActiveArea: (area: ActiveArea) => {
    globalState.activeArea = area;
  },

  setEnableVectorSearch: (enabled: boolean) => {
    globalState.enableVectorSearch = enabled;
  },

  setTagColor: (tag: string, color: string) => {
    const key = tag.trim();
    if (!key) return;
    const next = { ...globalState.tagColors, [key]: color };
    globalState.tagColors = next;
    void settingStorage.set('tagColors', next);
  },

  clearTagColor: (tag: string) => {
    const key = tag.trim();
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(globalState.tagColors, key)) return;
    const next = { ...globalState.tagColors };
    delete next[key];
    globalState.tagColors = next;
    void settingStorage.set('tagColors', next);
  },

  setColorSwatch: (index: number, color: string) => {
    if (!Number.isInteger(index)) return;
    if (index < 0 || index >= globalState.colorSwatches.length) return;
    if (!isHexColor(color)) return;
    const next = [...globalState.colorSwatches];
    next[index] = normalizeHexColor(color);
    globalState.colorSwatches = next;
    void settingStorage.set('colorSwatches', next);
  },

  togglePinMode: () => {
    globalState.pinMode = !globalState.pinMode;
  },

  setPinMode: (enabled: boolean) => {
    globalState.pinMode = enabled;
    void settingStorage.set('pinMode', enabled);
  },

  setPinTransparent: (enabled: boolean) => {
    globalState.pinTransparent = enabled;
    void settingStorage.set('pinTransparent', enabled);
  },

  setToggleWindowShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.toggleWindowShortcut;
    globalState.toggleWindowShortcut = next;
    await settingStorage.set('toggleWindowShortcut', next);

    const res = await window.electron?.setToggleWindowShortcut?.(next);
    if (res && res.success !== true) {
      globalState.toggleWindowShortcut = prev;
      await settingStorage.set('toggleWindowShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setCanvasOpacity: (opacity: number) => {
    const val = Math.max(0.1, Math.min(1, opacity));
    globalState.canvasOpacity = val;
    void settingStorage.set('canvasOpacity', val);
  },

  setMouseThrough: (enabled: boolean) => {
    globalState.mouseThrough = enabled;
    void settingStorage.set('mouseThrough', enabled);
    window.electron?.setIgnoreMouseEvents?.(enabled, { forward: true });
  },

  setCanvasOpacityUpShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    globalState.canvasOpacityUpShortcut = next;
    await settingStorage.set('canvasOpacityUpShortcut', next);
    return true;
  },

  setCanvasOpacityDownShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    globalState.canvasOpacityDownShortcut = next;
    await settingStorage.set('canvasOpacityDownShortcut', next);
    return true;
  },

  setToggleMouseThroughShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    const prev = globalState.toggleMouseThroughShortcut;
    globalState.toggleMouseThroughShortcut = next;
    await settingStorage.set('toggleMouseThroughShortcut', next);

    const res = await window.electron?.setToggleMouseThroughShortcut?.(next);
    if (res && res.success !== true) {
      globalState.toggleMouseThroughShortcut = prev;
      await settingStorage.set('toggleMouseThroughShortcut', prev);
      globalActions.pushToast(
        { key: 'toast.shortcutUpdateFailed', params: { error: res.error ?? '' } },
        'error',
      );
      return false;
    }
    return true;
  },

  setToggleGalleryShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    globalState.toggleGalleryShortcut = next;
    await settingStorage.set('toggleGalleryShortcut', next);
    return true;
  },

  setCanvasGroupShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;
    globalState.canvasGroupShortcut = next;
    await settingStorage.set('canvasGroupShortcut', next);
    return true;
  },

  setSidebarWidth: (width: number) => {
    globalState.sidebarWidth = width;
  },

  setGalleryOpen: (isOpen: boolean) => {
    globalState.isGalleryOpen = isOpen;
    void settingStorage.set('isGalleryOpen', isOpen);
  },

  persistSidebarWidth: () => {
    void settingStorage.set('sidebarWidth', globalState.sidebarWidth);
  },

  setLlmSettings: (settings: Partial<LLMSettings>) => {
    const next = { ...globalState.llmSettings, ...settings };
    globalState.llmSettings = next;
    void settingStorage.set('llmSettings', next);
  },

  setAppHidden: (hidden: boolean) => {
    globalState.isAppHidden = hidden;
  },
};
