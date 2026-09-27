import express from "express";

type ModelRouteDeps = {
  downloadModel: (onProgress: (data: unknown) => void) => Promise<void>;
  setOnDemandWarmup: (enabled: boolean) => Promise<void>;
  sendToRenderer?: import("../server").SendToRenderer;
};

export const createModelRouter = (deps: ModelRouteDeps) => {
  const router = express.Router();

  router.post("/api/download-model", async (_req, res) => {
    try {
      deps
        .downloadModel((data) => {
          deps.sendToRenderer?.("model-download-progress", data);
        })
        .catch((err) => {
          deps.sendToRenderer?.("model-download-progress", {
            type: "error",
            reason: String(err),
          });
        });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.put("/api/vector-service/on-demand-warmup", async (req, res) => {
    try {
      const { enabled } = req.body as { enabled?: unknown };
      if (typeof enabled !== "boolean") {
        res.status(400).json({ error: "Enabled must be a boolean" });
        return;
      }

      await deps.setOnDemandWarmup(enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
