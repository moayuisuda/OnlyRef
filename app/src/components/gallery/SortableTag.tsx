import React, { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { Tag, TagColorDot } from "../Tag";
import { THEME } from "../../theme";
import { useSnapshot } from "valtio";
import { globalActions, globalState } from "../../store/globalStore";
import { useT } from "../../i18n/useT";
import { importDroppedData } from "../../utils/import";

interface SortableTagProps {
  tag: string;
  itemId?: string;
  onClick: () => void;
  onRename?: (oldTag: string, newTag: string) => void;
  onDelete?: (tag: string) => void;
  isDraft?: boolean;
  autoEdit?: boolean;
  onCreate?: (tag: string) => Promise<boolean> | boolean;
  onCancelDraft?: () => void;
}

export const SortableTag: React.FC<SortableTagProps> = ({
  tag,
  itemId,
  onClick,
  onRename,
  onDelete,
  isDraft = false,
  autoEdit = false,
  onCreate,
  onCancelDraft,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sortableId = itemId ?? tag;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const snap = useSnapshot(globalState);
  const { t } = useT();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tag);
  const [showActions, setShowActions] = useState(false);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);

  const dragCounterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    if (isDraft) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsExternalDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isDraft) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsExternalDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isDraft) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (isDraft) return;
    e.preventDefault();
    e.stopPropagation();
    setIsExternalDragOver(false);
    dragCounterRef.current = 0;

    try {
      await importDroppedData(e.dataTransfer, [tag]);
    } catch (error) {
      console.error("Error importing dropped image to tag", error);
      globalActions.pushToast({ key: "toast.importImageFailed" }, "error");
    }
  };

  const isInEditSurface = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return false;
    if (rootRef.current?.contains(target)) return true;
    if (
      target instanceof HTMLElement &&
      target.closest("[data-tag-color-picker='true']")
    ) {
      return true;
    }
    return false;
  };

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transformOrigin: isDragging ? undefined : "left",
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    cursor: isEditing ? "text" : "grab",
    willChange: "transform",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDraft) return;
    setShowActions(false);
    onClick();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isDraft) return;
    e.preventDefault();
    e.stopPropagation();
    setShowActions(true);
    if (onRename) {
      setIsEditing(true);
      setEditValue(tag);
    }
  };

  const resetDraft = () => {
    setIsEditing(false);
    setShowActions(false);
    setEditValue("");
    onCancelDraft?.();
  };

  const commitRename = async (closeActions = false) => {
    const trimmed = editValue.trim();

    if (isDraft) {
      if (!trimmed) {
        resetDraft();
        return;
      }
      const created = await onCreate?.(trimmed);
      if (created === false) {
        return;
      }
      setIsEditing(false);
      setShowActions(false);
      return;
    }

    setIsEditing(false);
    if (closeActions) {
      setShowActions(false);
    }
    if (trimmed && trimmed !== tag) {
      onRename?.(tag, trimmed);
      return;
    }
    if (!trimmed) {
      setShowActions(false);
    }
    if (trimmed === tag || !trimmed) {
      setEditValue(tag);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void commitRename(true);
    } else if (e.key === "Escape") {
      if (isDraft) {
        resetDraft();
        return;
      }
      setIsEditing(false);
      setShowActions(false);
      setEditValue(tag);
    }
  };

  useEffect(() => {
    setEditValue(tag);
  }, [tag]);

  useEffect(() => {
    if (!autoEdit) return;
    setShowActions(true);
    setIsEditing(true);
  }, [autoEdit]);

  useEffect(() => {
    if (!showActions) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (isInEditSurface(event.target)) return;
      if (isEditing) {
        void commitRename(true);
        return;
      }
      setShowActions(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isDraft) {
        resetDraft();
        return;
      }
      setIsEditing(false);
      setShowActions(false);
      setEditValue(tag);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showActions, isEditing, editValue, tag, isDraft]);

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isInEditSurface(e.relatedTarget)) {
      return;
    }
    void commitRename(true);
  };

  if (isEditing) {
    const rawColor = isDraft ? undefined : snap.tagColors[tag];
    const normalized = typeof rawColor === "string" ? rawColor.trim() : "";
    const borderColor = normalized.length > 0 ? normalized : THEME.primary;
    const inputWidthCh = Math.max(
      4,
      editValue.trim().length || tag.length || 4,
    );

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex h-6 items-center flex-shrink-0"
        onMouseDown={(e) => e.stopPropagation()} // Prevent drag
      >
        <div
          className="flex h-full items-center gap-0.5 rounded border px-0.5"
          style={{
            borderColor,
            backgroundColor: normalized.length > 0 ? `${normalized}20` : "#262626",
          }}
        >
          <input
            autoFocus
            className="box-border h-full min-w-0 bg-transparent px-1 text-xs leading-none text-white outline-none"
            style={{ width: `${inputWidthCh + 2}ch` }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
          {!isDraft && (
            <TagColorDot
              tag={tag}
              color={rawColor}
              size="md"
              className="mx-0.5"
            />
          )}
          {onDelete && (
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-700/80 bg-red-950/75 text-red-200"
              title={t("common.delete")}
              aria-label={t("common.delete")}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(tag);
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rootRef.current = node;
      }}
      style={style}
      className="flex-shrink-0"
    >
      <div
        id={`tag-${sortableId}`}
        {...attributes}
        {...listeners}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Tag
          tag={tag}
          size="md"
          isEdit={true}
          showEditActions={showActions}
          highlight={isExternalDragOver}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onRemove={onDelete ? () => onDelete(tag) : undefined}
        />
      </div>
    </div>
  );
};
