import { useSnapshot } from "valtio";
import { useHotkeys } from "react-hotkeys-hook";
import { globalState, globalActions } from "../store/globalStore";
import { acceleratorToHotkey } from "../utils/hotkeys";
import { CANVAS_AUTO_LAYOUT } from "../events/uiEvents";

export const useAppShortcuts = () => {
  const snap = useSnapshot(globalState);

  const opacityUpHotkey = acceleratorToHotkey(snap.canvasOpacityUpShortcut);
  const opacityDownHotkey = acceleratorToHotkey(snap.canvasOpacityDownShortcut);
  const toggleGalleryHotkey = acceleratorToHotkey(snap.toggleGalleryShortcut);
  const canvasGroupHotkey = acceleratorToHotkey(snap.canvasGroupShortcut);

  useHotkeys(
    opacityUpHotkey ?? "",
    (e) => {
      e.preventDefault();
      const current = globalState.canvasOpacity;
      if (current < 1) {
        globalActions.setCanvasOpacity(Math.min(1, current + 0.05));
      }
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enabled: Boolean(opacityUpHotkey),
    },
    [opacityUpHotkey],
  );

  useHotkeys(
    opacityDownHotkey ?? "",
    (e) => {
      e.preventDefault();
      const current = globalState.canvasOpacity;
      if (current > 0.1) {
        globalActions.setCanvasOpacity(Math.max(0.1, current - 0.05));
      }
    },
    {
      preventDefault: true,
      enableOnFormTags: false,
      enabled: Boolean(opacityDownHotkey),
    },
    [opacityDownHotkey],
  );

  useHotkeys(
    toggleGalleryHotkey ?? "",
    (e) => {
      e.preventDefault();
      globalActions.setGalleryOpen(!globalState.isGalleryOpen);
    },
    { preventDefault: true, enabled: Boolean(toggleGalleryHotkey) },
    [toggleGalleryHotkey],
  );

  useHotkeys(
    canvasGroupHotkey ?? "",
    (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(CANVAS_AUTO_LAYOUT));
    },
    { preventDefault: true, enabled: Boolean(canvasGroupHotkey) },
    [canvasGroupHotkey],
  );
};
