import { proxy } from "valtio";

export type PreviewWindowImage = {
  id: string;
  filename: string;
  imagePath: string;
};

export type PreviewWindowPayload = {
  images: PreviewWindowImage[];
  activeImageId: string;
};

type PreviewWindowState = {
  hydrated: boolean;
  images: PreviewWindowImage[];
  activeImageId: string | null;
};

export const previewWindowState = proxy<PreviewWindowState>({
  hydrated: false,
  images: [],
  activeImageId: null,
});

export const previewWindowActions = {
  hydrate: (payload: PreviewWindowPayload | null) => {
    previewWindowState.hydrated = true;
    previewWindowState.images.splice(
      0,
      previewWindowState.images.length,
      ...(payload?.images ?? []),
    );
    previewWindowState.activeImageId = payload?.activeImageId ?? null;
  },

  setActiveImage: (imageId: string) => {
    if (!previewWindowState.images.some((image) => image.id === imageId)) {
      return;
    }
    previewWindowState.activeImageId = imageId;
  },
};
