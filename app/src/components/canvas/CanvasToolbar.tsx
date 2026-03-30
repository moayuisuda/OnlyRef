import React, { useEffect } from "react";
import { 
  Settings2, 
  X, 
  LayoutTemplate, 
  Map, 
  Eraser,
  Filter 
} from "lucide-react";
import { useSnapshot } from "valtio";
import { globalState, globalActions } from "../../store/globalStore";
import { anchorState, anchorActions } from "../../store/anchorStore";
import { useT } from "../../i18n/useT";
import { FilterSelector } from "./FilterSelector";
import clsx from "clsx";

interface CanvasToolbarProps {
  canvasFilters: readonly string[];
  showMinimap: boolean;
  isExpanded: boolean;
  onFiltersChange: (filters: string[]) => void;
  onToggleMinimap: () => void;
  onAutoLayout: () => void;
  onRequestClear: () => void;
  onToggleExpanded: () => void;
}

const ToolbarButton: React.FC<{
  onClick?: () => void;
  isActive?: boolean;
  variant?: "default" | "danger" | "ghost";
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, isActive, variant = "ghost", title, children, className }) => {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "h-7 w-7 flex items-center justify-center rounded transition-all duration-200",
        // Default ghost style
        variant === "ghost" && !isActive && "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800",
        // Active style
        isActive && "bg-primary text-white shadow-sm",
        // Danger style
        variant === "danger" && "text-neutral-400 hover:text-red-400 hover:bg-red-950/30",
        className
      )}
    >
      {children}
    </button>
  );
};

const ToolbarDivider = () => <div className="w-px h-4 bg-neutral-600" />;

const AnchorControls: React.FC = () => {
  const { t } = useT();
  const anchorSnap = useSnapshot(anchorState);
  const [animatingSlot, setAnimatingSlot] = React.useState<string | null>(null);
  const lastTimestampRef = React.useRef(0);

  useEffect(() => {
    if (anchorSnap.lastTriggered && anchorSnap.lastTriggered.timestamp > lastTimestampRef.current) {
      lastTimestampRef.current = anchorSnap.lastTriggered.timestamp;
      
      const startTimer = setTimeout(() => {
        setAnimatingSlot(anchorSnap.lastTriggered?.slot ?? null);
      }, 0);

      const endTimer = setTimeout(() => {
        setAnimatingSlot(null);
      }, 400);

      return () => {
        clearTimeout(startTimer);
        clearTimeout(endTimer);
      };
    }
  }, [anchorSnap.lastTriggered]);

  return (
    <div className="flex items-center gap-0.5">
      {['1', '2', '3'].map((slot) => {
        const hasAnchor = !!anchorSnap.anchors[slot];
        const isAnimating = animatingSlot === slot;
        
        return (
          <div key={slot} className="relative group flex items-center">
            <button
              className={clsx(
                "h-7 w-4 flex items-center justify-center rounded text-xs font-medium transition-all duration-200",
                !hasAnchor && "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 border border-transparent border-dashed hover:border-neutral-700",
                hasAnchor && "bg-neutral-800 text-primary border border-neutral-700 shadow-sm",
                isAnimating && "bg-primary text-white ring-2 ring-primary ring-offset-1 ring-offset-neutral-900"
              )}
              onClick={() => {
                  if (hasAnchor) {
                    anchorActions.restoreAnchor(slot);
                  } else {
                    anchorActions.saveAnchor(slot);
                    globalActions.pushToast({ key: "canvas.anchor.saved" }, "success");
                  }
              }}
              title={hasAnchor ? t('canvas.anchor.restore') : t('canvas.anchor.save')}
            >
              {slot}
            </button>
            {hasAnchor && (
              <button
                className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-neutral-800 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 border border-neutral-600 hover:bg-red-900/80 hover:border-red-700 shadow-md z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  anchorActions.deleteAnchor(slot);
                }}
                title={t('canvas.anchor.delete')}
              >
                <X size={8} className="text-neutral-400 hover:text-red-300" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  canvasFilters,
  showMinimap,
  isExpanded,
  onFiltersChange,
  onToggleMinimap,
  onAutoLayout,
  onRequestClear,
  onToggleExpanded,
}) => {
  const { t } = useT();
  const appSnap = useSnapshot(globalState);
  const hideCanvasButtons = appSnap.pinMode && appSnap.mouseThrough;

  useEffect(() => {
    anchorActions.loadAnchors();
  }, []);

  if (hideCanvasButtons) return null;

  return (
    <div className="absolute top-2 left-2 z-10 flex items-start gap-2">
      {/* Settings Toggle Button */}
      <button
        onClick={onToggleExpanded}
        className={clsx(
          "h-9 w-9 flex items-center justify-center rounded-lg border transition-all duration-200 shadow-lg backdrop-blur-md",
          isExpanded 
            ? "bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700" 
            : "bg-neutral-900/60 border-neutral-800/60 text-neutral-400 hover:text-white hover:bg-neutral-800/80"
        )}
        title={isExpanded ? t("canvas.toolbar.collapse") : t("canvas.toolbar.expand")}
      >
        <Settings2 
          className={clsx("transition-transform duration-300", isExpanded && "rotate-180")} 
          size={18} 
        />
      </button>

      {/* Expanded Toolbar Content */}
      <div
        className={clsx(
          "flex items-center p-1 gap-1 transition-all duration-300 ease-out origin-left",
          "bg-neutral-900/90 backdrop-blur-md border border-neutral-800/80 rounded-lg shadow-xl",
          isExpanded 
            ? "opacity-100 translate-x-0 scale-100" 
            : "opacity-0 -translate-x-4 scale-95 pointer-events-none hidden"
        )}
      >
        <FilterSelector
          activeFilters={canvasFilters}
          onChange={onFiltersChange}
          customTrigger={(isOpen) => (
             <ToolbarButton 
               isActive={canvasFilters.length > 0 || isOpen} 
               title={t("canvas.toolbar.filters")}
             >
               <Filter size={16} />
               {canvasFilters.length > 0 && (
                 <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full border border-neutral-900" />
               )}
             </ToolbarButton>
          )}
        />
        
        <ToolbarDivider />
        
        <ToolbarButton onClick={onAutoLayout} title={t("canvas.toolbar.smartLayout")}>
          <LayoutTemplate size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          isActive={showMinimap}
          onClick={onToggleMinimap}
          title={t("canvas.toolbar.toggleMinimap")}
        >
          <Map size={16} />
        </ToolbarButton>

        <ToolbarDivider />

        <AnchorControls />

        <ToolbarDivider />

        <ToolbarButton variant="danger" onClick={onRequestClear} title={t("common.clear")}>
          <Eraser size={16} />
        </ToolbarButton>
      </div>
    </div>
  );
};
