import { registerEvent } from "../register-event";
import { gamesSublevel, levelKeys } from "@main/level";
import { Game, GameShop } from "@types";
import { saveBackupManager } from "@main/services/save-backup-manager";
import { launchProfileManager } from "@main/services/launch-profile-manager";
import { sessionStats } from "@main/services/session-stats";
import { gameDiagnostics } from "@main/services/game-diagnostics";
import { storageManager } from "@main/services/storage-manager";
import { isGameRunning } from "@main/services/game-running-state";

const parseGameKey = (gameKey: string) => {
  const index = gameKey.indexOf(":");
  return {
    shop: gameKey.slice(0, index) as GameShop,
    objectId: gameKey.slice(index + 1),
  };
};

const getGame = async (gameKey: string) => {
  const { shop, objectId } = parseGameKey(gameKey);
  return gamesSublevel.get(levelKeys.game(shop, objectId));
};

registerEvent("getSaveBackupConfig", () => saveBackupManager.getConfigValue());
registerEvent("updateSaveBackupConfig", (_e, patch) =>
  saveBackupManager.updateConfig(patch)
);
registerEvent("getGameSaveConfig", (_e, gameKey: string) =>
  saveBackupManager.getGameConfig(gameKey)
);
registerEvent("setGameSavePaths", (_e, gameKey: string, paths: string[]) =>
  saveBackupManager.setGameSavePaths(gameKey, paths)
);
registerEvent("detectSavePaths", async (_e, gameKey: string) => {
  const game = await getGame(gameKey);
  return game ? saveBackupManager.detectSavePaths(game as Game) : [];
});
registerEvent("createSaveBackup", async (_e, gameKey: string) => {
  const game = await getGame(gameKey);
  if (!game) return null;
  return saveBackupManager.createBackup(game as Game, "manual");
});
registerEvent("listSaveBackups", (_e, gameKey?: string) =>
  saveBackupManager.listBackups(gameKey)
);
registerEvent("deleteSaveBackup", (_e, id: string) =>
  saveBackupManager.deleteBackup(id)
);
registerEvent("restoreSaveBackup", async (_e, id: string) => {
  const entry = (await saveBackupManager.listBackups()).find((b) => b.id === id);
  if (!entry) return { ok: false, message: "Backup not found." };
  const { shop, objectId } = parseGameKey(entry.gameKey);
  if (isGameRunning(objectId, shop)) {
    return { ok: false, message: "Close the game before restoring a backup." };
  }
  try {
    await saveBackupManager.restoreBackup(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
});
registerEvent("exportSaveBackup", (_e, id: string, destinationDir: string) =>
  saveBackupManager.exportBackup(id, destinationDir)
);
registerEvent("importSaveBackup", (_e, sourceDir: string) =>
  saveBackupManager.importBackup(sourceDir)
);

registerEvent("listLaunchProfiles", (_e, gameKey: string) =>
  launchProfileManager.list(gameKey)
);
registerEvent("saveLaunchProfile", (_e, gameKey: string, profile) =>
  launchProfileManager.save(gameKey, profile)
);
registerEvent("deleteLaunchProfile", (_e, gameKey: string, profileId: string) =>
  launchProfileManager.remove(gameKey, profileId)
);
registerEvent("duplicateLaunchProfile", (_e, gameKey: string, profileId: string) =>
  launchProfileManager.duplicate(gameKey, profileId)
);
registerEvent("setDefaultLaunchProfile", (_e, gameKey: string, profileId: string) =>
  launchProfileManager.setDefault(gameKey, profileId)
);
registerEvent("validateLaunchProfile", (_e, profile) =>
  launchProfileManager.validate(profile)
);
registerEvent("launchWithProfile", (_e, gameKey: string, profileId?: string) =>
  launchProfileManager.launch(gameKey, profileId)
);

registerEvent("getPlaytimeStats", (_e, gameKey: string) => sessionStats.get(gameKey));
registerEvent("getPlaytimeStatsSummary", () => sessionStats.summary());
registerEvent("correctPlaytimeSession", (_e, gameKey: string, sessionId: string, durationMs: number) =>
  sessionStats.correctSession(gameKey, sessionId, durationMs)
);
registerEvent("deletePlaytimeSession", (_e, gameKey: string, sessionId: string) =>
  sessionStats.deleteSession(gameKey, sessionId)
);

registerEvent("runGameDiagnostics", async (_e, gameKey: string) => {
  const game = await getGame(gameKey);
  if (!game) return null;
  return gameDiagnostics.run(game as Game);
});
registerEvent("fixGameDiagnostic", async (_e, gameKey: string, checkId: string) => {
  const game = await getGame(gameKey);
  if (!game) return { fixed: false, message: "Game not found." };
  return gameDiagnostics.fix(game as Game, checkId);
});

registerEvent("getStorageReport", () => storageManager.report());
registerEvent("moveGameInstallation", (_e, gameKey: string, destination: string) =>
  storageManager.moveGame(gameKey, destination)
);
registerEvent("cleanStorageCaches", (_e, ids: string[]) =>
  storageManager.cleanCaches(ids)
);
