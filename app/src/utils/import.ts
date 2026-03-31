import { actions, type ImageMeta } from '../store/galleryStore';
import { importImage, importImagesBatch } from '../service';
import {
  extractDroppedImageUrl,
  isHttpUrl,
  normalizeDroppedImageUrl,
} from './droppedImageUrl';

export const scanDroppedItems = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const items = Array.from(dataTransfer.items);
  const files: File[] = [];

  const scanEntry = async (entry: FileSystemEntry) => {
    if (entry.isFile) {
      try {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        files.push(file);
      } catch (e) {
        console.error('Failed to read file entry', entry.name, e);
      }
    } else if (entry.isDirectory) {
      try {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readAllEntries = async (): Promise<FileSystemEntry[]> => {
          const entries: FileSystemEntry[] = [];
          let batch: FileSystemEntry[] = [];
          do {
            batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
              reader.readEntries(resolve, reject);
            });
            entries.push(...batch);
          } while (batch.length > 0);
          return entries;
        };
        
        const entries = await readAllEntries();
        for (const e of entries) {
          await scanEntry(e);
        }
      } catch (e) {
        console.error('Failed to read directory entry', entry.name, e);
      }
    }
  };

  for (const item of items) {
    const entry = item.webkitGetAsEntry();
    if (entry) {
      await scanEntry(entry);
    }
  }
  return files;
};

export const importFiles = async (files: File[]): Promise<ImageMeta[]> => {
  const importedImages: ImageMeta[] = [];
  const pathFiles: (File & { path: string })[] = [];
  const bufferFiles: File[] = [];

  files.forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const fileWithPath = file as File & { path?: string };
    if (typeof fileWithPath.path === 'string' && fileWithPath.path.trim()) {
      pathFiles.push(fileWithPath as File & { path: string });
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
        imageUrl: `file://${encodeURI(file.path)}`,
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
  let files = await scanDroppedItems(dataTransfer);
  if (files.length === 0) {
    files = Array.from(dataTransfer.files || []);
  }

  if (files.length > 0) {
    return importFiles(files);
  }

  const imageUrl = extractDroppedImageUrl(dataTransfer);
  if (!imageUrl) {
    return [];
  }

  const image = await importImageUrl(imageUrl);
  return [image];
};
