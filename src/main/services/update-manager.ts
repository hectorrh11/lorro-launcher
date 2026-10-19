import updater, { UpdateInfo } from "electron-updater";
import { logger, WindowManager } from "@main/services";
import { AppUpdaterEvent, UserPreferences } from "@types";
import { app } from "electron";
import { publishNotificationUpdateReadyToInstall } from "@main/services/notifications";
import { db, levelKeys } from "@main/level";

const { autoUpdater } = updater;
const sendEventsForDebug = false;

const updateRepository = import.meta.env.MAIN_VITE_UPDATE_REPOSITORY;

export const isUpdateChannelConfigured = Boolean(updateRepository);

export class UpdateManager {
  private static hasNotified = false;
  private static newVersion = "";

  private static mockValuesForDebug() {
    this.sendEvent({ type: "update-available", info: { version: "3.3.1" } });
    this.sendEvent({ type: "update-downloaded" });
  }

  private static sendEvent(event: AppUpdaterEvent) {
    WindowManager.mainWindow?.webContents.send("autoUpdaterEvent", event);
  }

  private static async isAutoInstallEnabled() {
    if (!isUpdateChannelConfigured) return false;
    if (process.platform === "darwin") return false;
    if (process.platform === "win32") {
      return process.env.PORTABLE_EXECUTABLE_FILE == null;
    }

    if (process.platform === "linux") {
      const userPreferences = await db.get<string, UserPreferences | null>(
        levelKeys.userPreferences,
        {
          valueEncoding: "json",
        }
      );

      return userPreferences?.enableAutoInstall === true;
    }

    return false;
  }

  public static async checkForUpdates() {
    // Lorro Launcher has no publication repository configured yet. Never
    // contact an update server in that case: the UI shows a clear notice
    // instead of failing silently or checking the Hydra repository.
    if (!isUpdateChannelConfigured) {
      logger.info(
        "Auto-update disabled: MAIN_VITE_UPDATE_REPOSITORY is not configured"
      );
      return false;
    }

    autoUpdater
      .removeAllListeners()
      .on("update-available", (info: UpdateInfo) => {
        this.sendEvent({ type: "update-available", info });
        this.newVersion = info.version;
      })
      .on("update-downloaded", () => {
        this.sendEvent({ type: "update-downloaded" });

        if (!this.hasNotified) {
          this.hasNotified = true;
          publishNotificationUpdateReadyToInstall(this.newVersion);
        }
      })
      .on("error", (error) => {
        logger.error("Auto-update check failed", error);
      });

    const isAutoInstallAvailable = await this.isAutoInstallEnabled();

    if (app.isPackaged) {
      autoUpdater.autoDownload = isAutoInstallAvailable;
      autoUpdater.checkForUpdates().catch((error) => {
        logger.error("Could not check for updates", error);
      });
    } else if (sendEventsForDebug) {
      this.mockValuesForDebug();
    }

    return isAutoInstallAvailable;
  }
}
