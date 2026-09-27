import { proxy } from "valtio";
import { THEME } from "../theme";
import {
  AUTO_TAG_THRESHOLD_DEFAULT,
  normalizeAutoTagThreshold,
} from "../../shared/clipAutoTag";
import {
  getSettingsSnapshot,
  readSetting,
  settingStorage,
  syncSettingsSnapshotValue,
  updateTagColor,
  updateVectorOnDemandWarmup,
  type TagMeta,
} from "../service";
import type { I18nKey, I18nMessage, I18nParams } from "../../shared/i18n/types";
import {
  VECTOR_ON_DEMAND_WARMUP_DEFAULT,
  VECTOR_ON_DEMAND_WARMUP_SETTING_KEY,
} from "../../shared/vectorService";

const DEFAULT_WINDOW_ALWAYS_ON_TOP = false;

export interface EnvInitState {
  isOpen: boolean;
  progress: number;
  statusKey: I18nKey;
  statusParams?: I18nParams;
  percentText: string;
  detailText?: string;
  mode: "progress" | "selectStorage";
}

export const envInitState = proxy<EnvInitState>({
  isOpen: false,
  progress: 0,
  statusKey: "envInit.preparing",
  percentText: "0%",
  mode: "progress",
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
    envInitState.detailText = undefined;
    envInitState.mode = "progress";
  },
};

export type ToastType = "success" | "error" | "info" | "warning" | "loading";

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
  autoTagEnabled: boolean;
  autoTagThreshold: number;
  enableVectorSearch: boolean;
  vectorOnDemandWarmup: boolean;
  vectorOnDemandWarmupLoading: boolean;
  llmSettings: LLMSettings;
  isAppHidden: boolean;
  windowAlwaysOnTop: boolean;
  launchAtLogin: boolean;
  launchAtLoginLoading: boolean;
}

const DEFAULT_COLOR_SWATCHES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
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
  autoTagEnabled: true,
  autoTagThreshold: AUTO_TAG_THRESHOLD_DEFAULT,
  enableVectorSearch: true,
  vectorOnDemandWarmup: VECTOR_ON_DEMAND_WARMUP_DEFAULT,
  vectorOnDemandWarmupLoading: false,
  llmSettings: {
    enabled: false,
    baseUrl: "",
    key: "",
    model: "",
  },
  isAppHidden: false,
  windowAlwaysOnTop: DEFAULT_WINDOW_ALWAYS_ON_TOP,
  launchAtLogin: false,
  launchAtLoginLoading: false,
});

export const globalActions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
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
      const rawWindowAlwaysOnTop = readSetting<unknown>(
        settings,
        "windowAlwaysOnTop",
        DEFAULT_WINDOW_ALWAYS_ON_TOP,
      );
      const rawAutoTagThreshold = readSetting<unknown>(
        settings,
        "autoTagThreshold",
        AUTO_TAG_THRESHOLD_DEFAULT,
      );
      const rawAutoTagEnabled = readSetting<unknown>(
        settings,
        "autoTagEnabled",
        true,
      );
      const rawVectorOnDemandWarmup = readSetting<unknown>(
        settings,
        VECTOR_ON_DEMAND_WARMUP_SETTING_KEY,
        VECTOR_ON_DEMAND_WARMUP_DEFAULT,
      );
      const rawLlmSettings = readSetting<unknown>(settings, "llmSettings", {});
      globalState.colorSwatches = Array.isArray(rawColorSwatches)
        ? rawColorSwatches.filter(isHexColor).map((color) => normalizeHexColor(color))
        : [...DEFAULT_COLOR_SWATCHES];

      if (
        typeof rawToggleWindowShortcut === "string" &&
        rawToggleWindowShortcut.trim()
      ) {
        globalState.toggleWindowShortcut = rawToggleWindowShortcut.trim();
      }

      globalState.autoTagEnabled = rawAutoTagEnabled !== false;
      globalState.autoTagThreshold = normalizeAutoTagThreshold(
        rawAutoTagThreshold,
      );
      globalState.enableVectorSearch = true;
      void settingStorage.set("enableVectorSearch", true);
      globalState.vectorOnDemandWarmup = rawVectorOnDemandWarmup === true;
      globalState.windowAlwaysOnTop = rawWindowAlwaysOnTop === true;

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
    globalState.toasts.push({ id, message, type, createdAt: Date.now() });
    if (timeoutMs > 0) {
      window.setTimeout(() => {
        globalActions.removeToast(id);
      }, timeoutMs);
    }
    return id;
  },

  removeToast: (id: string) => {
    const index = globalState.toasts.findIndex((toast) => toast.id === id);
    if (index >= 0) {
      globalState.toasts.splice(index, 1);
    }
  },

  setEnableVectorSearch: (enabled: boolean) => {
    globalState.enableVectorSearch = enabled;
    void settingStorage.set("enableVectorSearch", enabled);
  },

  setVectorOnDemandWarmup: async (enabled: boolean) => {
    if (globalState.vectorOnDemandWarmupLoading) return;

    const previous = globalState.vectorOnDemandWarmup;
    globalState.vectorOnDemandWarmup = enabled;
    globalState.vectorOnDemandWarmupLoading = true;
    try {
      await updateVectorOnDemandWarmup(enabled);
      syncSettingsSnapshotValue(VECTOR_ON_DEMAND_WARMUP_SETTING_KEY, enabled);
    } catch (error) {
      globalState.vectorOnDemandWarmup = previous;
      console.error("Failed to update vector warmup policy", error);
      globalActions.pushToast(
        { key: "toast.vectorWarmupPolicyUpdateFailed" },
        "error",
      );
    } finally {
      globalState.vectorOnDemandWarmupLoading = false;
    }
  },

  setTagMetas: (tagMetas: TagMeta[]) => {
    const next: Record<string, string> = {};
    tagMetas.forEach((tagMeta) => {
      if (!tagMeta.name.trim() || !tagMeta.color) return;
      next[tagMeta.name] = tagMeta.color;
    });
    globalState.tagColors = next;
  },

  setAutoTagThreshold: (threshold: number) => {
    const next = normalizeAutoTagThreshold(threshold);
    globalState.autoTagThreshold = next;
    void settingStorage.set("autoTagThreshold", next);
  },

  setAutoTagEnabled: (enabled: boolean) => {
    globalState.autoTagEnabled = enabled;
    void settingStorage.set("autoTagEnabled", enabled);
  },

  setTagColor: (tag: string, color: string) => {
    const key = tag.trim();
    if (!key) return;
    const next = { ...globalState.tagColors, [key]: color };
    globalState.tagColors = next;
    void updateTagColor(key, color).catch((error) => {
      console.error(error);
    });
  },

  clearTagColor: (tag: string) => {
    const key = tag.trim();
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(globalState.tagColors, key)) return;
    const next = { ...globalState.tagColors };
    delete next[key];
    globalState.tagColors = next;
    void updateTagColor(key, null).catch((error) => {
      console.error(error);
    });
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

  syncWindowAlwaysOnTop: (alwaysOnTop: boolean) => {
    globalState.windowAlwaysOnTop = alwaysOnTop;
    syncSettingsSnapshotValue("windowAlwaysOnTop", alwaysOnTop);
  },

  setWindowAlwaysOnTop: async (alwaysOnTop: boolean) => {
    if (globalState.windowAlwaysOnTop === alwaysOnTop) return true;
    if (!window.electron?.setWindowAlwaysOnTop) {
      console.error("setWindowAlwaysOnTop bridge is unavailable");
      return false;
    }

    const result = await window.electron.setWindowAlwaysOnTop(alwaysOnTop);
    if (result.success !== true) {
      globalActions.pushToast(
        {
          key: "toast.windowAlwaysOnTopUpdateFailed",
          params: { error: result.error ?? "" },
        },
        "error",
      );
      return false;
    }

    globalActions.syncWindowAlwaysOnTop(result.alwaysOnTop);
    return true;
  },

  toggleWindowAlwaysOnTop: async () => {
    return globalActions.setWindowAlwaysOnTop(!globalState.windowAlwaysOnTop);
  },

  loadLaunchAtLogin: async () => {
    if (!window.electron?.getLaunchAtLogin) return false;

    globalState.launchAtLoginLoading = true;
    try {
      const result = await window.electron.getLaunchAtLogin();
      if (result.success !== true) {
        globalActions.pushToast(
          {
            key: "toast.launchAtLoginUpdateFailed",
            params: { error: result.error ?? "" },
          },
          "error",
        );
        return false;
      }

      globalState.launchAtLogin = result.enabled;
      return true;
    } finally {
      globalState.launchAtLoginLoading = false;
    }
  },

  setLaunchAtLogin: async (enabled: boolean) => {
    if (
      globalState.launchAtLoginLoading ||
      globalState.launchAtLogin === enabled ||
      !window.electron?.setLaunchAtLogin
    ) {
      return false;
    }

    globalState.launchAtLoginLoading = true;
    try {
      const result = await window.electron.setLaunchAtLogin(enabled);
      globalState.launchAtLogin = result.enabled;
      if (result.success !== true) {
        globalActions.pushToast(
          {
            key: "toast.launchAtLoginUpdateFailed",
            params: { error: result.error ?? "" },
          },
          "error",
        );
        return false;
      }
      return true;
    } finally {
      globalState.launchAtLoginLoading = false;
    }
  },
};
