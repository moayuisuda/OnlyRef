import { proxy } from 'valtio';
import { localApi } from '../service';
import { canvasState, canvasActions } from './canvasStore';

export interface AnchorData {
  canvasId: string;
  x: number;
  y: number;
  scale: number;
}

export interface AnchorState {
  anchors: Record<string, AnchorData>;
  lastTriggered: { slot: string; timestamp: number } | null;
}

export const anchorState = proxy<AnchorState>({
  anchors: {},
  lastTriggered: null,
});

export const anchorActions = {
  loadAnchors: async () => {
    try {
      const anchors = await localApi<Record<string, AnchorData>>('/api/anchors', undefined, { method: 'GET' });
      anchorState.anchors = anchors || {};
    } catch (error) {
      console.error('Failed to load anchors', error);
    }
  },

  saveAnchor: async (slot: string) => {
    try {
      const { currentCanvasName, canvasViewport } = canvasState;
      const anchorData: AnchorData = {
        canvasId: currentCanvasName,
        x: canvasViewport.x,
        y: canvasViewport.y,
        scale: canvasViewport.scale,
      };

      anchorState.anchors[slot] = anchorData;
      anchorState.lastTriggered = { slot, timestamp: Date.now() };

      // Persist to backend
      await localApi('/api/anchors', anchorState.anchors);
    } catch (error) {
      console.error('Failed to save anchor', error);
    }
  },

  restoreAnchor: async (slot: string) => {
    const anchor = anchorState.anchors[slot];
    if (!anchor) return;

    anchorState.lastTriggered = { slot, timestamp: Date.now() };

    if (anchor.canvasId !== canvasState.currentCanvasName) {
      await canvasActions.switchCanvas(anchor.canvasId);
    }
    
    canvasActions.setCanvasViewport({
      x: anchor.x,
      y: anchor.y,
      width: canvasState.canvasViewport.width,
      height: canvasState.canvasViewport.height,
      scale: anchor.scale,
    });
  },

  deleteAnchor: async (slot: string) => {
    const newAnchors = { ...anchorState.anchors };
    delete newAnchors[slot];
    anchorState.anchors = newAnchors;
    
    try {
      await localApi('/api/anchors', anchorState.anchors);
    } catch (error) {
      console.error('Failed to delete anchor', error);
    }
  }
};
