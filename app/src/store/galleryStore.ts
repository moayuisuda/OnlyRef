import { proxy } from 'valtio';
import {
  settingStorage,
  getSettingsSnapshot,
  readSetting,
  saveGalleryOrder,
  fetchImages,
  updateImage,
  deleteImage,
} from '../service';
import { canvasActions } from './canvasStore';
import { API_BASE_URL } from '../config';
import { globalActions, globalState, type LLMSettings } from './globalStore';
import { translateToClipFriendly } from '../llmService';

export interface ImageMeta {
  id: string;
  filename: string;
  imagePath: string;
  pageUrl?: string | null;
  tags: string[];
  createdAt: number;
  dominantColor?: string | null;
  tone?: string | null;
  hasVector?: boolean;
  isVectorResult?: boolean;
  vectorDistance?: number;
  vectorRowid?: number;
  rowid?: number;
  galleryOrder?: number | null;
}

export type SearchResult = ImageMeta & {
  score?: number;
};

export const getImageUrl = (imagePath: string) => {
  let normalized = imagePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith('images/')) {
    return `${API_BASE_URL}/images/${normalized}`;
  }
  return `${API_BASE_URL}/${normalized}`;
};

export const deriveNameFromFilename = (filename: string): string => {
  const trimmed = filename.trim();
  if (!trimmed) return 'image';
  const baseName = trimmed.split(/[\\/]/).pop() || trimmed;
  const dot = baseName.lastIndexOf('.');
  const withoutExt = dot <= 0 ? baseName : baseName.slice(0, dot) || baseName;
  if (withoutExt.startsWith('EMPTY_NAME_')) return '';
  return withoutExt;
};

export type GallerySort = 'manual' | 'createdAtDesc';

interface AppState {
  images: ImageMeta[];
  searchQuery: string;
  searchTags: string[];
  searchColor: string | null;
  searchTone: string | null;
  searchImage: ImageMeta | null;

  tagSortOrder: string[];
  gallerySort: GallerySort;
  loading: boolean;
  vectorLoading: boolean;
  hasMore: boolean;
  limit: number;
}

export const state = proxy<AppState>({
  images: [],
  searchQuery: '',
  searchTags: [],
  searchColor: null,
  searchTone: null,
  searchImage: null,
  tagSortOrder: [],
  gallerySort: 'manual',
  loading: false,
  vectorLoading: false,
  hasMore: true,
  limit: 50,
});

type RequestSession = {
  id: number;
  controller: AbortController;
};

type VectorCursor = {
  distance: number;
  rowid: number;
};

type TextCursor = {
  createdAt: number;
  rowid: number;
  galleryOrder?: number | null;
};

let requestSession: RequestSession | null = null;
let requestSessionId = 0;
let translationCache: {
  original: string;
  translated: string;
  llmFingerprint: string;
} | null = null;
let vectorCursor: VectorCursor | null = null;
let textCursor: TextCursor | null = null;

const startRequestSession = () => {
  requestSession?.controller.abort();
  const controller = new AbortController();
  const id = requestSessionId + 1;
  requestSessionId = id;
  requestSession = { id, controller };
  return { id, controller };
};

const isRequestSessionActive = (id: number, controller: AbortController) => {
  return (
    requestSession?.id === id &&
    requestSession?.controller === controller &&
    !controller.signal.aborted
  );
};

const getLlmFingerprint = (settings: LLMSettings | null | undefined) => {
  if (!settings?.enabled) return 'disabled';
  return `${settings.baseUrl}|${settings.model}`;
};

export const actions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawTagSortOrder = readSetting<unknown>(settings, 'tagSortOrder', []);
      const rawGallerySort = readSetting<unknown>(
        settings,
        'gallerySort',
        state.gallerySort,
      );

      if (
        Array.isArray(rawTagSortOrder) &&
        rawTagSortOrder.every((i) => typeof i === 'string')
      ) {
        state.tagSortOrder = rawTagSortOrder;
      }

      if (typeof rawGallerySort === 'string') {
        const allowed: GallerySort[] = ['manual', 'createdAtDesc'];
        if (allowed.includes(rawGallerySort as GallerySort)) {
          state.gallerySort = rawGallerySort as GallerySort;
        }
      }
    } catch (error) {
      console.error('Failed to hydrate settings:', error);
    }
  },

  createDropBatchId: () => {
    return `drop_${Date.now()}`;
  },

  createDroppedImageMeta: (
    file: {
      path?: string;
      storedFilename: string;
      originalName: string;
      dominantColor?: string | null;
      tone?: string | null;
    }
  ): ImageMeta => {
    const name = file.originalName.trim() || 'image';
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    return {
      id: `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      filename: base,
      imagePath: file.storedFilename,
      pageUrl: undefined,
      tags: [],
      createdAt: Date.now(),
      dominantColor: file.dominantColor ?? null,
      tone: file.tone ?? null,
      hasVector: false,
    };
  },

  setTagSortOrder: (order: string[]) => {
    state.tagSortOrder = order;
    void settingStorage.set('tagSortOrder', order);
  },

  setGallerySort: (sort: GallerySort) => {
    state.gallerySort = sort;
    void settingStorage.set('gallerySort', sort);
  },

  setImages: (images: ImageMeta[]) => {
    state.images = images.map((i) => ({ ...i }));
  },

  appendImages: (images: ImageMeta[]) => {
    const newImages = images.map((i) => ({ ...i }));
    // Avoid duplicates
    const existingIds = new Set(state.images.map((i) => i.id));
    for (const img of newImages) {
      if (!existingIds.has(img.id)) {
        state.images.push(img);
      }
    }
  },

  mergeImages: (images: ImageMeta[]) => {
    const newImages = images.map((i) => ({ ...i }));
    const imageMap = new Map(state.images.map((i) => [i.id, i]));
    
    for (const img of newImages) {
      if (imageMap.has(img.id)) {
        const existing = imageMap.get(img.id)!;
        if (!existing.isVectorResult && img.isVectorResult) {
          Object.assign(existing, { ...img, isVectorResult: existing.isVectorResult });
        } else {
          Object.assign(existing, img);
        }
      } else {
        state.images.push(img);
        imageMap.set(img.id, img);
      }
    }
  },

  saveGalleryOrder: async (images: ImageMeta[]) => {
    const order = images.map((img) => img.id);
    await saveGalleryOrder(order);
  },

  reorderImages: (images: ImageMeta[]) => {
    const next = images.map((i) => ({ ...i }));
    state.images = next;
    actions.saveGalleryOrder(next);
  },

  setLimit: (limit: number) => {
    state.limit = limit;
  },

  reload: () => {
    actions.resetSearchResults();
    void actions.loadImages(true, state.limit);
  },
  
  addImage: (image: ImageMeta) => {
    const existingIndex = state.images.findIndex(i => i.id === image.id);
    if (existingIndex >= 0) {
      Object.assign(state.images[existingIndex], image);
    } else {
      state.images.unshift(image);
    }
  },
  
  setSearchQuery: (query: string) => {
    state.searchQuery = query;
  },

  setSearchTags: (tags: string[]) => {
    state.searchTags = tags;
  },

  setSearchColor: (color: string | null) => {
    state.searchColor = color && color.trim() ? color.trim() : null;
  },
  
  setSearchTone: (tone: string | null) => {
    state.searchTone = tone && tone.trim() ? tone.trim() : null;
  },

  setSearchImage: (image: ImageMeta | null) => {
    state.searchImage = image;
  },

  resetSearchResults: () => {
    state.images = [];
    state.hasMore = true;
    vectorCursor = null;
    textCursor = null;
  },

  cancelLoad: () => {
    requestSession?.controller.abort();
  },

  loadImages: async (isReload: boolean, currentLimit: number) => {
    const { id, controller } = startRequestSession();
    const isActive = () => isRequestSessionActive(id, controller);

    state.loading = true;

    const query = state.searchQuery.trim();
    const searchTags = state.searchTags;
    const searchColor = state.searchColor;
    const searchTone = state.searchTone;

    const shouldVectorSearch = Boolean(query && globalState.enableVectorSearch);
    state.vectorLoading = shouldVectorSearch;

    const textCursorSnapshot = isReload ? null : textCursor;
    const textPromise = fetchImages<{
      items: ImageMeta[];
      nextCursor: TextCursor | null;
    }>(
      {
        query,
        tags: [...searchTags],
        color: searchColor,
        tone: searchTone,
        limit: currentLimit,
        cursorCreatedAt: textCursorSnapshot?.createdAt,
        cursorRowid: textCursorSnapshot?.rowid,
        cursorGalleryOrder: textCursorSnapshot?.galleryOrder ?? null,
      },
      { signal: controller.signal },
    );

    if (shouldVectorSearch) {
      void (async () => {
        let searchQ = query;

        if (globalState.llmSettings?.enabled) {
          const fingerprint = getLlmFingerprint(globalState.llmSettings);
          if (
            translationCache?.original === query &&
            translationCache?.llmFingerprint === fingerprint
          ) {
            searchQ = translationCache.translated;
          } else {
            try {
              const translated = await translateToClipFriendly(
                query,
                globalState.llmSettings,
                {
                  signal: controller.signal,
                },
              );
              if (!isActive()) return;
              translationCache = {
                original: query,
                translated,
                llmFingerprint: fingerprint,
              };
              searchQ = translated;
            } catch (e) {
              if (!isActive()) return;
              if (
                e &&
                typeof e === 'object' &&
                'name' in e &&
                (e as { name?: string }).name === 'AbortError'
              ) {
                return;
              }
              console.error('Translation failed', e);
              globalActions.pushToast(
                {
                  key: 'toast.llmTranslationFailed',
                  params: { error: (e as Error).message },
                },
                'error',
              );
            }
          }
        }

        if (!isActive()) return;

        try {
          const cursor = isReload ? null : vectorCursor;
          const data = await fetchImages<{
            items: ImageMeta[];
            nextCursor: VectorCursor | null;
          }>(
            {
              mode: 'vector',
              query: searchQ,
              tags: [...searchTags],
              color: searchColor,
              tone: searchTone,
              limit: currentLimit,
              cursorDistance: cursor?.distance,
              cursorRowid: cursor?.rowid,
            },
            { signal: controller.signal },
          );
          if (!isActive()) return;
          if (data && Array.isArray(data.items)) {
            if (data.nextCursor) {
              vectorCursor = {
                distance: data.nextCursor.distance,
                rowid: data.nextCursor.rowid,
              };
            } else {
              vectorCursor = null;
            }
            if (data.items.length > 0) {
              const vectorData = data.items.map((i) => ({
                ...i,
                isVectorResult: true,
              }));
              actions.mergeImages(vectorData);
            }
            if (isActive()) {
              state.hasMore = Boolean(textCursor || vectorCursor);
            }
          }
        } catch (err) {
          if (!isActive()) return;
          if (
            err &&
            typeof err === 'object' &&
            'name' in err &&
            (err as { name?: string }).name === 'AbortError'
          ) {
            return;
          }
          console.error('Vector search failed', err);
        } finally {
          if (isActive()) {
            state.vectorLoading = false;
          }
        }
      })();
    }

    try {
      const data = await textPromise;
      if (!isActive()) return;

      if (data && Array.isArray(data.items)) {
        if (isReload) {
          actions.setImages(data.items);
        } else {
          actions.appendImages(data.items);
        }
        if (data.nextCursor) {
          textCursor = {
            createdAt: data.nextCursor.createdAt,
            rowid: data.nextCursor.rowid,
            galleryOrder: data.nextCursor.galleryOrder ?? null,
          };
        } else {
          textCursor = null;
        }
        state.hasMore = Boolean(data.nextCursor || vectorCursor);
      }
    } catch (err) {
      if (!isActive()) return;
      const status = (err as Error & { status?: number }).status;
      if (status === 409) {
        globalActions.pushToast({ key: 'toast.storageIncompatible' }, 'error');
      }
    } finally {
      if (isActive()) {
        state.loading = false;
      }
    }
  },

  deleteImage: (imageId: string) => {
    const index = state.images.findIndex(img => img.id === imageId);
    if (index !== -1) {
      state.images.splice(index, 1);
    }
    canvasActions.removeImageFromCanvas(imageId);
  },

  updateImage: (imageId: string, updates: Partial<ImageMeta>) => {
    const index = state.images.findIndex((img) => img.id === imageId);
    if (index !== -1) {
      Object.assign(state.images[index], updates);
    }
  },

  requestUpdateImageName: async (image: ImageMeta, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    try {
      const data = await updateImage<{ success?: boolean; meta?: ImageMeta }>(image.id, {
        filename: trimmed,
      });
      if (data && data.success && data.meta) {
        actions.updateImage(image.id, data.meta);
        return data.meta;
      } else {
        globalActions.pushToast({ key: "toast.updateNameFailed" }, "error");
        return null;
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.updateNameFailed" }, "error");
      return null;
    }
  },

  requestDeleteImage: async (image: ImageMeta) => {
    try {
      await deleteImage(image.id);
      actions.deleteImage(image.id);
      globalActions.pushToast({ key: "toast.imageDeleted" }, "success");
      return true;
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.deleteImageFailed" }, "error");
      return false;
    }
  },
};
