import express from "express";

type ModelRouteDeps = {
  downloadModel: (onProgress: (data: unknown) => void) => Promise<void>;
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

  return router;
};
