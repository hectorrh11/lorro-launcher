import { appVersion, defaultDownloadsPath, isStaging } from "@main/constants";
import { app, ipcMain } from "electron";
import { ScreenshotService } from "@main/services/screenshot";
import { isUpdateChannelConfigured } from "@main/services/update-manager";
import { APP_NAME, APP_PROTOCOL } from "@shared";
import {
  cleanupAchievementSouvenirSync,
  getAchievementSouvenirSyncDetails,
  getAchievementSouvenirSyncStatus,
  retryAchievementSouvenirSync,
} from "@main/services/achievements/grouped-souvenir-worker";

import "./auth";
import "./autoupdater";
import "./big-picture";
import "./catalogue";
import "./chat";
import "./cloud-save";
import "./connectivity";
import "./custom-download";
import "./download-sources";
import "./friends";
import "./hardware";
import "./library";
import "./leveldb";
import "./main-window-controls";
import "./misc";
import "./notifications";
import "./profile";
import "./themes";
import "./torrenting";
import "./user";
import "./user-preferences";
import "./library/transfer-game-files";
import "./emulators";
import "./retroarch";
import "./epic";

ipcMain.handle("ping", () => "pong");
ipcMain.handle("getVersion", () => appVersion);
ipcMain.handle("isStaging", () => isStaging);
ipcMain.handle("getAppInfo", () => ({
  name: APP_NAME,
  protocol: APP_PROTOCOL,
  version: appVersion,
  updateChannelConfigured: isUpdateChannelConfigured,
  userDataPath: app.getPath("userData"),
}));
ipcMain.handle("getDefaultDownloadsPath", () => defaultDownloadsPath);
ipcMain.handle("getScreenshotsPath", () =>
  ScreenshotService.getScreenshotsPath()
);
ipcMain.handle("getAchievementSouvenirSyncStatus", () =>
  getAchievementSouvenirSyncStatus()
);
ipcMain.handle("getAchievementSouvenirSyncDetails", () =>
  getAchievementSouvenirSyncDetails()
);
ipcMain.handle("retryAchievementSouvenirSync", () =>
  retryAchievementSouvenirSync()
);
ipcMain.handle("cleanupAchievementSouvenirSync", () =>
  cleanupAchievementSouvenirSync()
);
ipcMain.handle("getCloudIframeUrl", () => {
  const checkoutUrl = import.meta.env.MAIN_VITE_CHECKOUT_URL;
  if (!checkoutUrl) return "";
  try {
    return new URL("/cloud", checkoutUrl).toString();
  } catch {
    return "";
  }
});
