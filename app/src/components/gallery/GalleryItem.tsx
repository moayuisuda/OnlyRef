import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ImageMeta, type SearchResult, deriveNameFromFilename, getImageUrl } from "../../store/galleryStore";
import { Tag } from "../Tag";
import { useT } from "../../i18n/useT";
import { Sparkles } from "lucide-react";

interface SortableGalleryItemProps {
  image: ImageMeta;
  enableVectorSearch: boolean;
  showTagsPreview: boolean;
  onContextMenu: (e: React.MouseEvent, image: ImageMeta) => void;
  onClick: (image: ImageMeta) => void;
}

const ensureTags = (tags: string[] | undefined | null): string[] =>
  Array.isArray(tags) ? tags : [];

export const SortableGalleryItem: React.FC<SortableGalleryItemProps> = ({
  image,
  enableVectorSearch,
  showTagsPreview,
  onContextMenu,
  onClick,
}) => {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transformOrigin: "top",
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  const name = deriveNameFromFilename(image.filename);
  const score = "score" in image ? (image as SearchResult).score : undefined;

  return (
    <div
      ref={setNodeRef}
      id={image.id}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-4 group overflow-hidden relative rounded hover:z-10 cursor-grab active:cursor-grabbing"
    >
      <div
        onContextMenu={(e) => onContextMenu(e, image)}
        onClick={() => onClick(image)}
      >
        <img
          src={getImageUrl(image.imagePath)}
          alt={name || t("gallery.referenceAlt")}
          className="w-full bg-neutral-800 transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 pointer-events-none max-w-[calc(100%-2rem)]">
          {name && (
            <div
              className="px-2 py-1 rounded bg-black/30 backdrop-blur-sm text-white text-[8px] font-normal leading-none truncate w-fit max-w-full"
              title={name}
            >
              {name}
            </div>
          )}
          {import.meta.env.DEV && score !== undefined && (
            <div
              className="px-2 py-1 rounded bg-black/30 backdrop-blur-sm text-white text-[8px] font-normal leading-none truncate w-fit max-w-full"
              title={`Score: ${score.toFixed(4)}`}
            >
              {score.toFixed(4)}
            </div>
          )}
        </div>

        {enableVectorSearch && !image.hasVector && (
          <div
            className="absolute top-2 right-2 w-2 h-2 rounded-full bg-yellow-500 shadow-sm"
            title={t("gallery.notIndexed")}
          />
        )}

        {image.isVectorResult && (
          <div
            className="absolute top-2 right-2 text-[var(--color-primary)] drop-shadow-[0_0_6px_rgba(57,197,187,0.55)]"
            title={t("gallery.vectorResult")}
          >
            <Sparkles size={12} strokeWidth={2.5} color="currentColor" />
          </div>
        )}

        {ensureTags(image.tags as string[]).length > 0 && (
          <div
            className={`absolute bottom-0 left-0 right-0 p-2 transition-opacity pointer-events-none ${
              showTagsPreview ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <div className="flex flex-wrap gap-1 items-center">
              {ensureTags(image.tags as string[])
                .slice(0, 5)
                .map((tag) => (
                  <Tag key={tag} tag={tag} />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
