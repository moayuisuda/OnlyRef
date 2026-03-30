import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tag } from "../Tag";
import { THEME } from "../../theme";
import { useSnapshot } from "valtio";
import { globalState } from "../../store/globalStore";

interface SortableTagProps {
  tag: string;
  onClick: () => void;
  onRename?: (oldTag: string, newTag: string) => void;
}

export const SortableTag: React.FC<SortableTagProps> = ({
  tag,
  onClick,
  onRename,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag });

  const snap = useSnapshot(globalState);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tag);

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transformOrigin: isDragging ? undefined : "left",
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    cursor: isEditing ? "text" : "grab",
    willChange: "transform",
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRename) {
      setIsEditing(true);
      setEditValue(tag);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onRename) {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(true);
      setEditValue(tag);
    }
  };

  const commitRename = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tag) {
      onRename?.(tag, trimmed);
    } else {
      setEditValue(tag);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitRename();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(tag);
    }
  };

  if (isEditing) {
    const rawColor = snap.tagColors[tag];
    const normalized = typeof rawColor === "string" ? rawColor.trim() : "";
    const borderColor = normalized.length > 0 ? normalized : THEME.primary;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex-shrink-0"
        onMouseDown={(e) => e.stopPropagation()} // Prevent drag
      >
        <input
          autoFocus
          className="min-w-[72px] rounded-full border bg-white/[0.05] px-3 py-1.5 text-xs text-white outline-none"
          style={{
            borderColor,
            backgroundColor: normalized.length > 0 ? `${normalized}20` : "rgba(255,255,255,0.04)",
          }}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div
      id={`tag-${tag}`}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex-shrink-0"
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <Tag tag={tag} size="md" onClick={onClick} />
    </div>
  );
};
