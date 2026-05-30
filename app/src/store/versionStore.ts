import { proxy } from "valtio";

type UpdaterPayload = {
  enabled: boolean;
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  downloadProgress: number;
  errorMessage: string;
};

type VersionState = {
  currentVersion: string;
  latestVersion: string;
  updateEnabled: boolean;
  updateStatus: UpdateStatus;
  downloadProgress: number;
  errorMessage: string;
};

const normalizeVersion = (version: string) => version.trim().replace(/^v/i, "");

const applyUpdaterState = (payload: Partial<UpdaterPayload>) => {
  if (typeof payload.enabled === "boolean") {
    versionState.updateEnabled = payload.enabled;
  }

  if (typeof payload.status === "string") {
    versionState.updateStatus = payload.status;
  }

  if (typeof payload.currentVersion === "string") {
    versionState.currentVersion = normalizeVersion(payload.currentVersion);
  }

  if (typeof payload.latestVersion === "string") {
    versionState.latestVersion = normalizeVersion(payload.latestVersion);
  }

  if (typeof payload.downloadProgress === "number") {
    versionState.downloadProgress = Math.max(
      0,
      Math.min(100, payload.downloadProgress),
    );
  }

  if (typeof payload.errorMessage === "string") {
    versionState.errorMessage = payload.errorMessage.trim();
  }
};

export const versionState = proxy<VersionState>({
  currentVersion: "",
  latestVersion: "",
  updateEnabled: false,
  updateStatus: "idle",
  downloadProgress: 0,
  errorMessage: "",
});

let initTask: Promise<void> | null = null;
let hasUpdaterSubscription = false;

const syncUpdaterState = async () => {
  const payload = await window.electron?.getUpdaterState?.();
  if (!payload) return;
  applyUpdaterState(payload);
};

const applyUpdaterActionResult = (result?: { success: boolean; error?: string }) => {
  if (!result || result.success) return;
  versionState.updateStatus = "error";
  versionState.errorMessage = result.error?.trim() || "";
};

export const versionActions = {
  async init() {
    if (!initTask) {
      initTask = (async () => {
        if (!hasUpdaterSubscription && window.electron?.onUpdaterState) {
          hasUpdaterSubscription = true;
          window.electron.onUpdaterState((payload) => {
            applyUpdaterState(payload);
          });
        }

        await syncUpdaterState();
      })();
    }

    await initTask;
  },

  async checkForUpdates() {
    await versionActions.init();
    const result = await window.electron?.checkAppUpdate?.();
    applyUpdaterActionResult(result);
  },

  async downloadUpdate() {
    await versionActions.init();
    const result = await window.electron?.downloadAppUpdate?.();
    applyUpdaterActionResult(result);
  },

  async quitAndInstallUpdate() {
    await versionActions.init();
    const result = await window.electron?.quitAndInstallAppUpdate?.();
    applyUpdaterActionResult(result);
  },
};
