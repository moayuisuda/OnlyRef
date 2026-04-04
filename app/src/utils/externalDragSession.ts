import type { ImageMeta } from "../store/galleryStore";

type ExternalDragSession = {
  filename: string;
  normalizedImagePath: string;
  expiresAt: number;
};

const EXTERNAL_DRAG_SESSION_TTL = 15000;

let activeSession: ExternalDragSession | null = null;

const normalizeValue = (value: string): string => value.trim().toLowerCase();

const normalizePath = (value: string): string =>
  normalizeValue(value).replace(/\\/g, "/").replace(/\/+/g, "/");

const getActiveSession = (): ExternalDragSession | null => {
  if (!activeSession) {
    return null;
  }

  if (activeSession.expiresAt <= Date.now()) {
    activeSession = null;
    return null;
  }

  return activeSession;
};

export const markExternalDragSession = (
  image: Pick<ImageMeta, "filename" | "imagePath">,
): void => {
  activeSession = {
    filename: normalizeValue(image.filename),
    normalizedImagePath: normalizePath(image.imagePath),
    expiresAt: Date.now() + EXTERNAL_DRAG_SESSION_TTL,
  };
};

export const clearExternalDragSession = (): void => {
  activeSession = null;
};

export const isExternalDragSessionMatch = (payload: {
  fileName?: string | null;
  nativePath?: string | null;
}): boolean => {
  const session = getActiveSession();
  if (!session) {
    return false;
  }

  const normalizedFileName = payload.fileName
    ? normalizeValue(payload.fileName)
    : "";
  const normalizedNativePath = payload.nativePath
    ? normalizePath(payload.nativePath)
    : "";

  if (
    normalizedNativePath &&
    (normalizedNativePath === session.normalizedImagePath ||
      normalizedNativePath.endsWith(`/${session.filename}`))
  ) {
    return true;
  }

  return normalizedFileName !== "" && normalizedFileName === session.filename;
};

