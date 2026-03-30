import { proxy } from "valtio";
import { THEME } from "../theme";
import { getSettingsSnapshot, readSetting, settingStorage } from "../service";
import type { I18nKey, I18nMessage, I18nParams } from "../../shared/i18n/types";

export interface EnvInitState {
  isOpen: boolean;
  progress: number;
  statusKey: I18nKey;
  statusParams?: I18nParams;
  percentText: string;
}

export const envInitState = proxy<EnvInitState>({
  isOpen: false,
  progress: 0,
  statusKey: "envInit.preparing",
  percentText: "0%",
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
    envInitState.statusKey = "envInit.preparing";
    envInitState.statusParams = undefined;
    envInitState.percentText = "0%";
  },
};

export type ToastType = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  message: I18nMessage;
  type: ToastType;
  createdAt: number;
};

export interface LLMSettings {
  enabled: boolean;
  baseUrl: string;
  key: string;
  model: string;
}

export interface GlobalState {
  tagColors: Record<string, string>;
  colorSwatches: string[];
  toasts: Toast[];
  toggleWindowShortcut: string;
  enableVectorSearch: boolean;
  llmSettings: LLMSettings;
  isAppHidden: boolean;
}

const DEFAULT_COLOR_SWATCHES = [
  "#39c5bb",
  "#3b82f6",
  "#06b6d4",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#94a3b8",
  "#ffffff",
  "#0f172a",
] as const;

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");

const DEFAULT_TOGGLE_WINDOW_SHORTCUT = isMac ? "Command+L" : "Ctrl+L";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isHexColor = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  return (
    /^#[0-9a-fA-F]{6}$/.test(value.trim()) ||
    /^#[0-9a-fA-F]{3}$/.test(value.trim())
  );
};

const normalizeHexColor = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const r = normalized[1];
    const g = normalized[2];
    const b = normalized[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return THEME.primary;
};

export const globalState = proxy<GlobalState>({
  tagColors: {},
  colorSwatches: [...DEFAULT_COLOR_SWATCHES],
  toasts: [],
  toggleWindowShortcut: DEFAULT_TOGGLE_WINDOW_SHORTCUT,
  enableVectorSearch: false,
  llmSettings: {
    enabled: false,
    baseUrl: "",
    key: "",
    model: "",
  },
  isAppHidden: false,
});

export const globalActions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawTagColors = readSetting<Record<string, unknown>>(
        settings,
        "tagColors",
        {},
      );
      const rawColorSwatches = readSetting<unknown>(
        settings,
        "colorSwatches",
        [...DEFAULT_COLOR_SWATCHES],
      );
      const rawToggleWindowShortcut = readSetting<unknown>(
        settings,
        "toggleWindowShortcut",
        DEFAULT_TOGGLE_WINDOW_SHORTCUT,
      );
      const rawEnableVectorSearch = readSetting<unknown>(
        settings,
        "enableVectorSearch",
        false,
      );
      const rawLlmSettings = readSetting<unknown>(settings, "llmSettings", {});

      const nextTagColors: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawTagColors)) {
        if (typeof key === "string" && typeof value === "string" && key.trim()) {
          nextTagColors[key] = value;
        }
      }
      globalState.tagColors = nextTagColors;

      let swatches: string[] = [];
      if (Array.isArray(rawColorSwatches)) {
        swatches = rawColorSwatches
          .filter(isHexColor)
          .map((color) => normalizeHexColor(color));
      }
      globalState.colorSwatches =
        swatches.length > 0
          ? swatches.slice(0, DEFAULT_COLOR_SWATCHES.length)
          : [...DEFAULT_COLOR_SWATCHES];

      if (
        typeof rawToggleWindowShortcut === "string" &&
        rawToggleWindowShortcut.trim()
      ) {
        globalState.toggleWindowShortcut = rawToggleWindowShortcut.trim();
      }

      if (typeof rawEnableVectorSearch === "boolean") {
        globalState.enableVectorSearch = rawEnableVectorSearch;
      }

      if (isRecord(rawLlmSettings)) {
        globalState.llmSettings = {
          enabled:
            typeof rawLlmSettings.enabled === "boolean"
              ? rawLlmSettings.enabled
              : false,
          baseUrl:
            typeof rawLlmSettings.baseUrl === "string"
              ? rawLlmSettings.baseUrl
              : "",
          key:
            typeof rawLlmSettings.key === "string" ? rawLlmSettings.key : "",
          model:
            typeof rawLlmSettings.model === "string"
              ? rawLlmSettings.model
              : "",
        };
      }
    } catch (error) {
      console.error("Failed to hydrate settings:", error);
    }
  },

  pushToast: (message: I18nMessage, type: ToastType = "info", timeoutMs = 3200) => {
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
    globalState.toasts = globalState.toasts.filter((toast) => toast.id !== id);
  },

  setEnableVectorSearch: (enabled: boolean) => {
    globalState.enableVectorSearch = enabled;
    void settingStorage.set("enableVectorSearch", enabled);
  },

  setTagColor: (tag: string, color: string) => {
    const key = tag.trim();
    if (!key) return;
    const next = { ...globalState.tagColors, [key]: color };
    globalState.tagColors = next;
    void settingStorage.set("tagColors", next);
  },

  clearTagColor: (tag: string) => {
    const key = tag.trim();
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(globalState.tagColors, key)) return;
    const next = { ...globalState.tagColors };
    delete next[key];
    globalState.tagColors = next;
    void settingStorage.set("tagColors", next);
  },

  setColorSwatch: (index: number, color: string) => {
    if (!Number.isInteger(index)) return;
    if (index < 0 || index >= globalState.colorSwatches.length) return;
    if (!isHexColor(color)) return;
    const next = [...globalState.colorSwatches];
    next[index] = normalizeHexColor(color);
    globalState.colorSwatches = next;
    void settingStorage.set("colorSwatches", next);
  },

  setToggleWindowShortcut: async (accelerator: string) => {
    const next = accelerator.trim();
    if (!next) return false;

    const previous = globalState.toggleWindowShortcut;
    globalState.toggleWindowShortcut = next;
    await settingStorage.set("toggleWindowShortcut", next);

    const result = await window.electron?.setToggleWindowShortcut?.(next);
    if (result && result.success !== true) {
      globalState.toggleWindowShortcut = previous;
      await settingStorage.set("toggleWindowShortcut", previous);
      globalActions.pushToast(
        { key: "toast.shortcutUpdateFailed", params: { error: result.error ?? "" } },
        "error",
      );
      return false;
    }

    return true;
  },

  setLlmSettings: (settings: Partial<LLMSettings>) => {
    const next = { ...globalState.llmSettings, ...settings };
    globalState.llmSettings = next;
    void settingStorage.set("llmSettings", next);
  },

  setAppHidden: (hidden: boolean) => {
    globalState.isAppHidden = hidden;
  },
};
