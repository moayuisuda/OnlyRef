import { actions, type ImageMeta } from '../store/galleryStore';
import { importImage, importImagesBatch } from '../service';
import {
  extractDroppedImageUrl,
  isHttpUrl,
  normalizeDroppedImageUrl,
} from './droppedImageUrl';
import {
  clearExternalDragSession,
  isExternalDragSessionMatch,
} from './externalDragSession';

type NativePathFile = File & {
  path?: string;
  webkitRelativePath?: string;
};

const MAX_DROP_SCAN_CONCURRENCY = 16;

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
};

const getHardwareConcurrency = () => {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  return 8;
};

const getDropScanConcurrency = (workItems: number) => {
  const hw = getHardwareConcurrency();
  const base = clampInt(hw, 4, MAX_DROP_SCAN_CONCURRENCY);
  return clampInt(Math.min(base, Math.max(1, workItems)), 1, MAX_DROP_SCAN_CONCURRENCY);
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const limit = Math.max(1, Math.floor(concurrency || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const getNativeFilePath = (file: File): string => {
  const path = (file as NativePathFile).path;
  return typeof path === 'string' ? path.trim() : '';
};

const normalizeNativePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/');
  return normalized.toLowerCase();
};

const filterOutExistingLibraryFiles = async (files: File[]): Promise<File[]> => {
  let hasSelfDragMatch = false;

  const filteredFiles = files.filter((file) => {
    const nativePath = normalizeNativePath(getNativeFilePath(file));
    if (
      isExternalDragSessionMatch({
        fileName: file.name,
        nativePath,
      })
    ) {
      hasSelfDragMatch = true;
      return false;
    }
    return true;
  });

  if (hasSelfDragMatch) {
    clearExternalDragSession();
  }

  return filteredFiles;
};

const getDroppedFileKeys = (file: File): string[] => {
  const keys: string[] = [];
  const nativePath = getNativeFilePath(file);
  if (nativePath) {
    keys.push(`path:${nativePath}`);
  }

  const relativePath = (file as NativePathFile).webkitRelativePath?.trim();
  if (relativePath) {
    keys.push(`relative:${relativePath}:${file.size}:${file.lastModified}`);
  }

  keys.push(`meta:${file.name}:${file.size}:${file.lastModified}:${file.type}`);
  return keys;
};

const mergeDroppedFiles = (...fileLists: File[][]): File[] => {
  const keyToCanonicalKey = new Map<string, string>();
  const fileMap = new Map<string, File>();

  fileLists.forEach((files) => {
    files.forEach((file) => {
      const keys = getDroppedFileKeys(file);
      const canonicalKey = keys.find((key) => keyToCanonicalKey.has(key)) ?? keys[0];
      const existing = fileMap.get(canonicalKey);

      if (!existing) {
        fileMap.set(canonicalKey, file);
      } else if (!getNativeFilePath(existing) && getNativeFilePath(file)) {
        // Electron 原生 path 对批量本地导入更稳定，命中重复时优先保留它。
        fileMap.set(canonicalKey, file);
      }

      keys.forEach((key) => {
        keyToCanonicalKey.set(key, canonicalKey);
      });
    });
  });

  return Array.from(fileMap.values());
};

const scanDroppedEntry = async (entry: FileSystemEntry): Promise<File[]> => {
  if (entry.isFile) {
    try {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      return [file];
    } catch (e) {
      console.error('Failed to read file entry', entry.name, e);
      return [];
    }
  }

  if (entry.isDirectory) {
    try {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const entries: FileSystemEntry[] = [];
      let batch: FileSystemEntry[] = [];
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
        entries.push(...batch);
      } while (batch.length > 0);

      const lists = await mapWithConcurrency(
        entries,
        getDropScanConcurrency(entries.length),
        async (child) => scanDroppedEntry(child),
      );
      return lists.flat();
    } catch (e) {
      console.error('Failed to read directory entry', entry.name, e);
      return [];
    }
  }

  return [];
};

export const scanDroppedItems = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  const lists = await mapWithConcurrency(
    entries,
    getDropScanConcurrency(entries.length),
    async (entry) => scanDroppedEntry(entry),
  );
  return lists.flat();
};

const resolveDroppedFiles = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const scannedFiles = await scanDroppedItems(dataTransfer);
  const directFiles = Array.from(dataTransfer.files || []);
  return mergeDroppedFiles(scannedFiles, directFiles);
};

export const importFiles = async (files: File[]): Promise<ImageMeta[]> => {
  const importedImages: ImageMeta[] = [];
  const pathFiles: (File & { path: string })[] = [];
  const bufferFiles: File[] = [];

  files.forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const nativePath = getNativeFilePath(file);
    if (nativePath) {
      pathFiles.push(file as File & { path: string });
      return;
    }
    bufferFiles.push(file);
  });

  if (pathFiles.length > 0) {
    const data = await importImagesBatch<{
      success?: boolean;
      items?: ImageMeta[];
      failedCount?: number;
    }>({
      items: pathFiles.map((file) => ({
        type: 'path',
        data: file.path,
        name: file.name,
        filename: file.name,
      })),
    });

    if (!data.success) {
      throw new Error('Failed to import images');
    }

    const metas = Array.isArray(data.items) ? data.items : [];
    metas.forEach((meta) => {
      actions.addImage(meta);
      importedImages.push(meta);
    });

    if (metas.length === 0 && (data.failedCount ?? 0) > 0) {
      throw new Error('Failed to import images');
    }
  }

  for (const file of bufferFiles) {
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const data = await importImage<{ success?: boolean; meta?: ImageMeta }>({
        imageBase64,
        filename: file.name,
      });
      if (data.success && data.meta) {
        actions.addImage(data.meta);
        importedImages.push(data.meta);
      }
    } catch (e) {
      console.error('Error importing file', file.name, e);
    }
  }

  if (importedImages.length > 0) {
    await actions.loadTags();
  }

  return importedImages;
};

export const importImageUrl = async (imageUrl: string): Promise<ImageMeta> => {
  const trimmedUrl = normalizeDroppedImageUrl(imageUrl.trim());
  if (!isHttpUrl(trimmedUrl)) {
    throw new Error('Invalid image url');
  }

  const data = await importImage<{ success?: boolean; meta?: ImageMeta }>({
    imageUrl: trimmedUrl,
  });

  if (!data.success || !data.meta) {
    throw new Error('Failed to import image');
  }

  actions.addImage(data.meta);
  await actions.loadTags();
  return data.meta;
};

export const importDroppedData = async (
  dataTransfer: DataTransfer,
): Promise<ImageMeta[]> => {
  const files = await resolveDroppedFiles(dataTransfer);
  const filteredFiles = await filterOutExistingLibraryFiles(files);

  if (filteredFiles.length > 0) {
    return importFiles(filteredFiles);
  }

  if (files.length > 0) {
    return [];
  }

  const imageUrl = extractDroppedImageUrl(dataTransfer);
  if (!imageUrl) {
    return [];
  }

  const image = await importImageUrl(imageUrl);
  return [image];
};
