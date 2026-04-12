import { API_BASE_URL } from "../config";
import { normalizeLocale } from "../shared/i18n/locale";
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

export const syncSettingsSnapshotValue = <T>(key: string, value: T): void => {
  if (!settingsSnapshot) return;
  settingsSnapshot = {
    ...settingsSnapshot,
    [key]: value,
  };
};

export const resetSettingsSnapshot = (): void => {
  settingsSnapshot = null;
  settingsSnapshotPromise = null;
};

export const getSystemLocale = (): Locale => {
  if (typeof navigator === "undefined") {
    return "en";
  }
  return normalizeLocale(navigator.language);
};

export async function getLanguage(): Promise<Locale> {
  const settings = await getSettingsSnapshot();
  const raw = readSetting<unknown>(settings, "language", undefined);
  return normalizeLocale(raw, getSystemLocale());
}

export async function setLanguage(locale: Locale): Promise<void> {
  await settingStorage.set("language", locale);
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

export type VectorSearchSource =
  | {
      type: "text";
      query: string;
    }
  | {
      type: "imageId";
      imageId: string;
    }
  | {
      type: "localPath";
      localPath: string;
    };

export type VectorImageSearchPayload = {
  source: VectorSearchSource;
  tags?: string[];
  color?: string | null;
  tone?: string | null;
  limit?: number;
  cursorDistance?: number;
  cursorRowid?: number;
};

export type RequestOptions = {
  signal?: AbortSignal;
};

export type TagMeta = {
  name: string;
  color: string | null;
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

export async function searchImagesByVectorSource<T = unknown>(
  payload: VectorImageSearchPayload,
  options: RequestOptions = {}
): Promise<T> {
  return localApi<T>("/api/images/vector-search", payload, {
    method: "POST",
    signal: options.signal,
  });
}

export function getLocalImagePreviewUrl(localPath: string): string {
  const searchParams = new URLSearchParams({
    path: localPath,
  });
  return `${API_BASE_URL}/api/local-image-preview?${searchParams.toString()}`;
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

export async function importImagesBatch<T = unknown>(payload: {
  items: ImportImagePayload[];
}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/import-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to import images: ${res.status}`);
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

export async function deleteTag(tag: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/tag/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete tag: ${res.status}`);
  }
}

export async function fetchTags(): Promise<TagMeta[]> {
  const res = await fetch(`${API_BASE_URL}/api/tags`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tags: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Invalid tags response");
  }
  return data.filter(
    (item): item is TagMeta =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as TagMeta).name === "string" &&
      ((item as TagMeta).color === null ||
        typeof (item as TagMeta).color === "string")
  );
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
