import {
  detectExternalDownloadManager,
  openInExternalDownloadManager,
} from "@main/helpers/external-download-manager";
import { customDownloadManager } from "@main/services/custom-download-manager";
import type { StartCustomDownloadPayload } from "@types";

import { registerEvent } from "../register-event";

registerEvent(
  "startCustomDownload",
  (_event: Electron.IpcMainInvokeEvent, payload: StartCustomDownloadPayload) =>
    customDownloadManager.start(payload)
);

registerEvent("getCustomDownloads", () => customDownloadManager.list());

registerEvent(
  "pauseCustomDownload",
  (_event: Electron.IpcMainInvokeEvent, id: string) =>
    customDownloadManager.pause(id)
);

registerEvent(
  "resumeCustomDownload",
  (_event: Electron.IpcMainInvokeEvent, id: string) =>
    customDownloadManager.resume(id)
);

registerEvent(
  "cancelCustomDownload",
  (_event: Electron.IpcMainInvokeEvent, id: string) =>
    customDownloadManager.cancel(id)
);

registerEvent(
  "removeCustomDownload",
  (_event: Electron.IpcMainInvokeEvent, id: string) =>
    customDownloadManager.remove(id)
);

registerEvent("getExternalDownloadManager", () =>
  detectExternalDownloadManager()
);

registerEvent(
  "openDownloadInExternalManager",
  (_event: Electron.IpcMainInvokeEvent, id: string) => {
    const download = customDownloadManager
      .list()
      .find((item) => item.id === id);

    if (!download) {
      return { available: false, name: null, path: null, mode: "none", started: false };
    }

    return openInExternalDownloadManager(
      download.url,
      download.destinationDir,
      download.fileName
    );
  }
);

void customDownloadManager.initialize();
