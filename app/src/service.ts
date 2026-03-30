import { API_BASE_URL } from "./config";
import type { Locale } from "../shared/i18n/types";

export interface settingStorageGetOptions<T> {
  key: string;
  fallback: T;
}

export type SettingsSnapshot = Record<string, unknown>;

let settingsSnapshot: SettingsSnapshot | null = null;
let settingsSnapshotPromise: Promise<SettingsSnapshot> | null = null;

export const getSettingsSnapshot = async (): Promise<SettingsSnapshot> => {
  if (settingsSnapshot) return settingsSnapshot;
  if (!settingsSnapshotPromise) {
    settingsSnapshotPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        if (!res.ok) return {};
        const data = (await res.json()) as unknown;
        if (data && typeof data === "object") {
          return data as SettingsSnapshot;
        }
      } catch {
        return {};
      }
      return {};
    })();
  }
  const result = await settingsSnapshotPromise;
  settingsSnapshot = result;
  return result;
};

export const readSetting = <T>(
  settings: SettingsSnapshot,
  key: string,
  fallback: T
): T => {
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    return (settings as Record<string, unknown>)[key] as T;
  }
  return fallback;
};

export const settingStorage = {
  async get<T>({ key, fallback }: settingStorageGetOptions<T>): Promise<T> {
    if (settingsSnapshot) {
      if (Object.prototype.hasOwnProperty.call(settingsSnapshot, key)) {
        return (settingsSnapshot as Record<string, unknown>)[key] as T;
      }
      return fallback;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/settings/${encodeURIComponent(key)}`
      );
      if (!res.ok) return fallback;
      const data = (await res.json()) as unknown;
      if (!data || typeof data !== "object") return fallback;
      if (!("value" in data)) return fallback;
      const value = (data as { value: unknown }).value;
      return (value as T) ?? fallback;
    } catch {
      return fallback;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/settings/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (settingsSnapshot) {
        settingsSnapshot = { ...settingsSnapshot, [key]: value };
      }
    } catch (error) {
      void error;
    }
  },
};

const isLocale = (value: unknown): value is Locale => value === "en" || value === "zh";

export async function getLanguage(): Promise<Locale> {
  const settings = await getSettingsSnapshot();
  const raw = readSetting<unknown>(settings, "language", "en");
  return isLocale(raw) ? raw : "en";
}

export async function setLanguage(locale: Locale): Promise<void> {
  await settingStorage.set("language", locale);
}

export interface CanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export async function loadCanvasImages<T = unknown[]>(canvasName?: string): Promise<T> {
  const url = canvasName 
    ? `${API_BASE_URL}/api/load-canvas?canvasName=${encodeURIComponent(canvasName)}` 
    : `${API_BASE_URL}/api/load-canvas`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load canvas: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return data as T;
}

export async function getCanvasViewport<T = unknown>(canvasName?: string): Promise<T | null> {
  const url = canvasName 
    ? `${API_BASE_URL}/api/canvas-viewport?canvasName=${encodeURIComponent(canvasName)}` 
    : `${API_BASE_URL}/api/canvas-viewport`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as unknown;
  if (data === null) return null;
  return data as T;
}

export async function saveCanvasViewport(
  viewport: CanvasViewport,
  canvasName?: string
): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/canvas-viewport", { viewport, canvasName });
  } catch (error) {
    void error;
  }
}

export interface CanvasMeta {
  name: string;
  lastModified: number;
}

export async function listCanvases(): Promise<CanvasMeta[]> {
  const res = await fetch(`${API_BASE_URL}/api/canvases`);
  if (!res.ok) throw new Error("Failed to list canvases");
  return res.json() as Promise<CanvasMeta[]>;
}

export async function createCanvas(name: string): Promise<void> {
  await localApi("/api/canvases", { name });
}

export async function renameCanvas(oldName: string, newName: string): Promise<void> {
  await localApi("/api/canvases/rename", { oldName, newName });
}

export async function deleteCanvas(name: string): Promise<void> {
  await localApi("/api/canvases/delete", { name });
}

export async function getTempDominantColor(
  filePath: string
): Promise<string | null> {
  try {
    const data = await localApi<{
      success?: boolean;
      dominantColor?: string | null;
    }>("/api/temp-dominant-color", {
      filePath,
    });
    if (!data || data.success !== true) return null;
    if (typeof data.dominantColor !== "string") return null;
    const trimmed = data.dominantColor.trim();
    if (!trimmed) return null;
    return trimmed;
  } catch (error) {
    void error;
    return null;
  }
}

export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/delete-temp-file", {
      filePath,
    });
  } catch (error) {
    void error;
  }
}

export async function saveGalleryOrder(order: string[]): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/save-gallery-order", { order });
  } catch (error) {
    void error;
  }
}

export async function moveGalleryOrder(activeId: string, overId: string): Promise<void> {
  try {
    await localApi<{ success?: boolean }>("/api/order-move", { activeId, overId });
  } catch (error) {
    void error;
  }
}

export type ImageSearchParams = {
  mode?: "text" | "vector";
  query?: string;
  tags?: string[];
  color?: string | null;
  tone?: string | null;
  limit?: number;
  cursorDistance?: number;
  cursorRowid?: number;
  cursorCreatedAt?: number;
  cursorGalleryOrder?: number | null;
};

export type RequestOptions = {
  signal?: AbortSignal;
};

export async function fetchImages<T = unknown>(
  params: ImageSearchParams = {},
  options: RequestOptions = {}
): Promise<T> {
  const searchParams = new URLSearchParams();
  if (params.mode) searchParams.set("mode", params.mode);
  if (params.query) searchParams.set("query", params.query);
  if (params.tags && params.tags.length > 0) {
    searchParams.set("tags", params.tags.join(","));
  }
  if (params.color) searchParams.set("color", params.color);
  if (params.tone) searchParams.set("tone", params.tone);
  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }
  if (typeof params.cursorCreatedAt === "number") {
    searchParams.set("cursorCreatedAt", String(params.cursorCreatedAt));
  }
  if (typeof params.cursorRowid === "number") {
    searchParams.set("cursorRowid", String(params.cursorRowid));
  }
  if (typeof params.cursorGalleryOrder === "number") {
    searchParams.set("cursorGalleryOrder", String(params.cursorGalleryOrder));
  }
  if (typeof params.cursorDistance === "number") {
    searchParams.set("cursorDistance", String(params.cursorDistance));
  }
  const url = `${API_BASE_URL}/api/images${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) {
    const error = new Error(`Failed to fetch images: ${res.status}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  const data = (await res.json()) as T;
  return data;
}

export type ImageUpdatePayload = {
  filename?: string;
  tags?: string[];
  dominantColor?: string | null;
  tone?: string | null;
  pageUrl?: string | null;
};

export async function updateImage<T = unknown>(
  id: string,
  payload: ImageUpdatePayload
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/image/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update image: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function deleteImage(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/image/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete image: ${res.status}`);
  }
}

export type ImportImagePayload = {
  imageBase64?: string;
  imageUrl?: string;
  type?: "url" | "path" | "buffer";
  data?: string;
  filename?: string;
  name?: string;
  pageUrl?: string;
  tags?: string[];
};

export async function importImage<T = unknown>(
  payload: ImportImagePayload
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to import image: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function renameTag(oldTag: string, newTag: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/tag/${encodeURIComponent(oldTag)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName: newTag }),
  });
  if (!res.ok) {
    throw new Error(`Failed to rename tag: ${res.status}`);
  }
}

export async function indexImages<T = unknown>(payload: {
  imageId?: string;
  mode?: string;
}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to index images: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function localApi<TResponse>(
  endpoint: string,
  payload?: unknown,
  options: RequestOptions & { method?: string } = {}
): Promise<TResponse> {
  const method = options.method || (payload ? "POST" : "GET");
  const fetchOptions: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
  };

  if (payload && method !== "GET" && method !== "HEAD") {
    fetchOptions.body = JSON.stringify(payload);
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  try {
    return (await res.json()) as TResponse;
  } catch {
    return null as unknown as TResponse;
  }
}
