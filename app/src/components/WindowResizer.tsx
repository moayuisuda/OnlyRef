import React, { useEffect, useRef } from "react";

type Direction = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const WindowResizer: React.FC = () => {
  const [isResizing, setIsResizing] = React.useState(false);
  const resizingRef = useRef<{
    active: boolean;
    direction: Direction | null;
    startX: number;
    startY: number;
    startBounds: { x: number; y: number; width: number; height: number };
  }>({
    active: false,
    direction: null,
    startX: 0,
    startY: 0,
    startBounds: { x: 0, y: 0, width: 0, height: 0 },
  });

  const isHoveringRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current.active || !resizingRef.current.direction) return;

      const { startX, startY, startBounds, direction } = resizingRef.current;
      const deltaX = e.screenX - startX;
      const deltaY = e.screenY - startY;

      const newBounds = { ...startBounds };

      if (direction.includes("e")) {
        newBounds.width = Math.max(400, startBounds.width + deltaX);
      }
      if (direction.includes("s")) {
        newBounds.height = Math.max(300, startBounds.height + deltaY);
      }
      if (direction.includes("w")) {
        const w = Math.max(400, startBounds.width - deltaX);
        newBounds.width = w;
        newBounds.x = startBounds.x + (startBounds.width - w);
      }
      if (direction.includes("n")) {
        const h = Math.max(300, startBounds.height - deltaY);
        newBounds.height = h;
        newBounds.y = startBounds.y + (startBounds.height - h);
      }

      // Use a requestAnimationFrame or throttle if needed, but direct IPC is usually fine for this volume
      window.electron?.setWindowBounds(newBounds);
    };

    const handleMouseUp = () => {
      if (resizingRef.current.active) {
        resizingRef.current.active = false;
        resizingRef.current.direction = null;
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // If mouse is not hovering the resizer anymore (moved out during drag),
        // we should restore the ignore mouse events state
        if (!isHoveringRef.current) {
          window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleMouseDown = (direction: Direction) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Note: window.screenX/Y and outerWidth/Height are generally reliable in Electron renderer
    const startBounds = {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    };

    resizingRef.current = {
      active: true,
      direction,
      startX: e.screenX,
      startY: e.screenY,
      startBounds,
    };
    setIsResizing(true);

    let cursor = "default";
    if (direction === "nw" || direction === "se") cursor = "nwse-resize";
    else if (direction === "ne" || direction === "sw") cursor = "nesw-resize";
    else if (direction === "n" || direction === "s") cursor = "ns-resize";
    else if (direction === "w" || direction === "e") cursor = "ew-resize";

    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
  };

  const handleMouseEnter = () => {
    isHoveringRef.current = true;
    window.electron?.setIgnoreMouseEvents?.(false);
  };

  const size = 8; // px
  const classes = "absolute z-[9999] bg-transparent pointer-events-auto no-drag";
  const commonProps = {
    onMouseEnter: handleMouseEnter,
    // onMouseLeave: handleMouseLeave,
  };

  return (
    <>
      {isResizing && (
        <div
          className="fixed inset-0 z-[10000]"
          style={{ cursor: document.body.style.cursor }}
        />
      )}
      {/* Corners - Larger hit area */}
      <div
        className={`${classes} cursor-nwse-resize`}
        style={{ top: 0, left: 0, width: size * 2, height: size * 2 }}
        onMouseDown={handleMouseDown("nw")}
        title="Resize"
        {...commonProps}
      />
      <div
        className={`${classes} cursor-nesw-resize`}
        style={{ top: 0, right: 0, width: size * 2, height: size * 2 }}
        onMouseDown={handleMouseDown("ne")}
        title="Resize"
        {...commonProps}
      />
      <div
        className={`${classes} cursor-nesw-resize`}
        style={{ bottom: 0, left: 0, width: size * 2, height: size * 2 }}
        onMouseDown={handleMouseDown("sw")}
        title="Resize"
        {...commonProps}
      />
      <div
        className={`${classes} cursor-nwse-resize`}
        style={{ bottom: 0, right: 0, width: size * 2, height: size * 2 }}
        onMouseDown={handleMouseDown("se")}
        title="Resize"
        {...commonProps}
      />

      {/* Edges */}
      <div
        className={`${classes} cursor-ns-resize`}
        style={{ top: 0, left: size * 2, right: size * 2, height: size }}
        onMouseDown={handleMouseDown("n")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ns-resize`}
        style={{ bottom: 0, left: size * 2, right: size * 2, height: size }}
        onMouseDown={handleMouseDown("s")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ew-resize`}
        style={{ top: size * 2, bottom: size * 2, left: 0, width: size }}
        onMouseDown={handleMouseDown("w")}
        {...commonProps}
      />
      <div
        className={`${classes} cursor-ew-resize`}
        style={{ top: size * 2, bottom: size * 2, right: 0, width: size }}
        onMouseDown={handleMouseDown("e")}
        {...commonProps}
      />
    </>
  );
};
