import React, { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { ImagePlus, Maximize2 } from "lucide-react";
import { useSnapshot } from "valtio";
import { useT } from "../i18n/useT";
import { importDroppedData } from "../utils/import";
import { globalActions, globalState } from "../store/globalStore";

type WindowDragState = {
  active: boolean;
  startCursorX: number;
  startCursorY: number;
  startWindowX: number;
  startWindowY: number;
};

export const FloatingOrb: React.FC = () => {
  const globalSnap = useSnapshot(globalState);
  const { t } = useT();

  const [isDropActive, setIsDropActive] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [isImportSuccess, setIsImportSuccess] = useState(false);
  const isImportingRef = useRef(false);
  const successTimerRef = useRef<number | null>(null);

  const dragEnterCounterRef = useRef(0);
  const windowDragRef = useRef<WindowDragState>({
    active: false,
    startCursorX: 0,
    startCursorY: 0,
    startWindowX: 0,
    startWindowY: 0,
  });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!windowDragRef.current.active) return;

      const nextX =
        windowDragRef.current.startWindowX +
        (event.screenX - windowDragRef.current.startCursorX);
      const nextY =
        windowDragRef.current.startWindowY +
        (event.screenY - windowDragRef.current.startCursorY);

      window.electron?.setWindowBounds({
        x: Math.round(nextX),
        y: Math.round(nextY),
      });
    };

    const handleMouseUp = () => {
      if (!windowDragRef.current.active) return;
      windowDragRef.current.active = false;
      setIsWindowDragging(false);
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const resetDropState = () => {
    dragEnterCounterRef.current = 0;
    setIsDropActive(false);
  };

  const triggerImportSuccess = () => {
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
    }
    setIsImportSuccess(true);
    successTimerRef.current = window.setTimeout(() => {
      setIsImportSuccess(false);
      successTimerRef.current = null;
    }, 980);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-floating-control='true']")) {
      return;
    }

    windowDragRef.current = {
      active: true,
      startCursorX: event.screenX,
      startCursorY: event.screenY,
      startWindowX: window.screenX,
      startWindowY: window.screenY,
    };
    setIsWindowDragging(true);
    document.body.style.userSelect = "none";
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragEnterCounterRef.current += 1;
    setIsDropActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragEnterCounterRef.current = Math.max(0, dragEnterCounterRef.current - 1);
    if (dragEnterCounterRef.current === 0) {
      setIsDropActive(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetDropState();

    if (isImportingRef.current) return;

    try {
      isImportingRef.current = true;
      const imported = await importDroppedData(event.dataTransfer);
      if (imported.length > 0) {
        triggerImportSuccess();
      }
    } catch (error) {
      console.error("Error importing dropped image", error);
      globalActions.pushToast({ key: "toast.importImageFailed" }, "error");
    } finally {
      isImportingRef.current = false;
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950 text-white">
      <div
        className={clsx(
          "absolute inset-0 flex items-center justify-center transition-colors",
          isWindowDragging ? "cursor-grabbing" : "cursor-grab",
          isDropActive && "bg-white/[0.06]",
          isImportSuccess && "floating-surface-success",
        )}
        onMouseDown={handleMouseDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ImagePlus
          size={22}
          className={clsx(
            "transition-colors duration-150",
            isDropActive || isImportSuccess
              ? "text-[var(--color-primary)]"
              : "text-[var(--color-primary)]/90",
          )}
        />
      </div>

      <button
        type="button"
        data-floating-control="true"
        className="absolute right-[2px] top-[2px] z-20 flex h-[16px] w-[16px] items-center justify-center rounded text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        title={t("floating.restore")}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => {
          void globalActions.setFloatingWindowMode(!globalSnap.floatingWindowMode);
        }}
      >
        <Maximize2 size={9} />
      </button>
    </div>
  );
};
