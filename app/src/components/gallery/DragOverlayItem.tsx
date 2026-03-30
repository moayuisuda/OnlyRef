import React from "react";

interface DragOverlayItemProps {
  size?: { width: number; height: number } | null;
  className?: string;
  children: React.ReactNode;
}

export const DragOverlayItem: React.FC<DragOverlayItemProps> = ({
  size,
  className,
  children,
}) => (
  <div
    className={`pointer-events-none ${className || ""}`}
    style={size ? { width: size.width, height: size.height } : undefined}
  >
    {children}
  </div>
);

