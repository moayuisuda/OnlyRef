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
  onDragStart: (e: React.DragEvent, image: ImageMeta) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageMeta) => void;
  onClick: (image: ImageMeta) => void;
}

const ensureTags = (tags: string[] | undefined | null): string[] =>
  Array.isArray(tags) ? tags : [];

export const SortableGalleryItem: React.FC<SortableGalleryItemProps> = ({
  image,
  enableVectorSearch,
  onDragStart,
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
      className="group relative mb-5 cursor-grab overflow-hidden rounded-[1.35rem] border border-white/6 bg-[rgba(255,255,255,0.02)] shadow-[0_18px_48px_rgba(0,0,0,0.22)] transition-all duration-300 hover:z-10 hover:-translate-y-1 hover:border-white/12 active:cursor-grabbing"
    >
      <div
        draggable
        onDragStart={(e) => onDragStart(e, image)}
        onContextMenu={(e) => onContextMenu(e, image)}
        onClick={() => onClick(image)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/32 to-transparent" />
        <img
          src={getImageUrl(image.imagePath)}
          alt={name || t("gallery.referenceAlt")}
          className="w-full bg-neutral-800 transition-transform duration-500 group-hover:scale-[1.035]"
          loading="lazy"
        />

        <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-2.75rem)] flex-col gap-1.5">
          {name && (
            <div
              className="w-fit max-w-full rounded-full border border-white/10 bg-black/28 px-2.5 py-1 text-[9px] font-medium leading-none text-white/92 backdrop-blur-md"
              title={name}
            >
              {name}
            </div>
          )}
          {import.meta.env.DEV && score !== undefined && (
            <div
              className="w-fit max-w-full rounded-full border border-white/10 bg-black/28 px-2.5 py-1 text-[9px] font-medium leading-none text-white/92 backdrop-blur-md"
              title={`Score: ${score.toFixed(4)}`}
            >
              {score.toFixed(4)}
            </div>
          )}
        </div>

        {enableVectorSearch && !image.hasVector && (
          <div
            className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]"
            title={t("gallery.notIndexed")}
          />
        )}

        {image.isVectorResult && (
          <div
            className="absolute right-3 top-3 rounded-full border border-[rgba(57,197,187,0.26)] bg-[rgba(57,197,187,0.18)] p-1.5 text-white backdrop-blur-md"
            title={t("gallery.vectorResult")}
          >
            <Sparkles size={10} strokeWidth={3} />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 opacity-100">
          <div className="rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,rgba(9,11,13,0.05),rgba(9,11,13,0.78))] p-2.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/45">
              <span>Tags</span>
              <span>{ensureTags(image.tags as string[]).length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
            {ensureTags(image.tags as string[])
              .slice(0, 5)
              .map((tag) => (
                <Tag key={tag} tag={tag} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
