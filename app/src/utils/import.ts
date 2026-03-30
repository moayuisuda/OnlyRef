import { actions, type ImageMeta } from '../store/galleryStore';
import { getTempDominantColor, importImage, localApi } from '../service';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const uploadTempImage = async (
  file: File
): Promise<{ filename: string; path: string } | null> => {
  const imageBase64 = await fileToDataUrl(file);
  if (!imageBase64) return null;

  const data = await localApi<{
    success?: boolean;
    filename?: string;
    path?: string;
  }>('/api/upload-temp', {
    imageBase64,
    filename: file.name,
  });
  if (
    !data ||
    !data.success ||
    typeof data.filename !== 'string' ||
    typeof data.path !== 'string'
  ) {
    return null;
  }
  return { filename: data.filename, path: data.path };
};

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

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;

    try {
      const fileWithPath = file as File & { path?: string };
      let imageUrl: string | null = null;

      if (fileWithPath.path) {
        imageUrl = `file://${encodeURI(fileWithPath.path)}`;

        const data = await importImage<{ success?: boolean; meta?: ImageMeta }>({
          imageUrl,
          name: file.name,
          filename: file.name,
        });
        if (data.success && data.meta) {
          actions.addImage(data.meta);
          importedImages.push(data.meta);
        }
      } else {
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
      }
    } catch (e) {
      console.error('Error importing file', file.name, e);
    }
  }

  return importedImages;
};

export const createTempMetasFromFiles = async (
  files: File[]
): Promise<ImageMeta[]> => {
  const metas: ImageMeta[] = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const uploaded = await uploadTempImage(file);
      if (!uploaded) continue;
      const dominantColor = await getTempDominantColor(uploaded.path);
      const meta = actions.createDroppedImageMeta({
        path: uploaded.path,
        storedFilename: `temp-images/${uploaded.filename}`,
        originalName: file.name,
        dominantColor,
      });
      metas.push(meta);
    } catch (e) {
      console.error('Error creating temp meta', file.name, e);
    }
  }

  return metas;
};
