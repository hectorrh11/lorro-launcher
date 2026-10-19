import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services/logger";

const MIGRATION_MARKER = ".lorro-data.json";
const LEGACY_DIRECTORY_NAME = "hydralauncher";

type MigrationMarker = {
  migratedFrom?: string;
  migratedAt?: string;
};

const readMarker = (userDataPath: string): MigrationMarker | null => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(userDataPath, MIGRATION_MARKER), "utf8")
    ) as MigrationMarker;
  } catch {
    return null;
  }
};

const hasExistingData = (directory: string) => {
  try {
    return fs.readdirSync(directory).length > 0;
  } catch {
    return false;
  }
};

/**
 * Offers a one-time, opt-in import of the legacy Hydra Launcher data directory.
 * The import only copies into an empty Lorro data directory, never overwrites
 * existing files, and records a marker so the prompt is not shown again.
 */
export const offerLegacyHydraMigration = async () => {
  if (!app.isPackaged) return;

  const userDataPath = app.getPath("userData");
  if (readMarker(userDataPath)) return;
  if (hasExistingData(userDataPath)) return;

  const legacyPath = path.join(
    app.getPath("appData"),
    LEGACY_DIRECTORY_NAME
  );

  if (!fs.existsSync(legacyPath)) return;

  const { response } = await dialog.showMessageBox({
    type: "question",
    buttons: ["Import Hydra data", "Start fresh"],
    defaultId: 0,
    cancelId: 1,
    title: "Lorro Launcher",
    message: "Import your existing Hydra Launcher data?",
    detail:
      "Lorro Launcher uses its own data folder and never overwrites it silently. " +
      "You can copy your library, settings and saved data from the previous " +
      "Hydra Launcher installation now. The original Hydra data is left untouched.",
    noLink: true,
  });

  if (response !== 0) {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, MIGRATION_MARKER),
      JSON.stringify({ migratedFrom: null, migratedAt: new Date().toISOString() })
    );
    return;
  }

  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.cpSync(legacyPath, userDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    fs.writeFileSync(
      path.join(userDataPath, MIGRATION_MARKER),
      JSON.stringify({
        migratedFrom: legacyPath,
        migratedAt: new Date().toISOString(),
      })
    );
    logger.info("Imported legacy Hydra data", { legacyPath, userDataPath });
  } catch (error) {
    logger.error("Failed to import legacy Hydra data", error);
    await dialog.showMessageBox({
      type: "warning",
      title: "Lorro Launcher",
      message: "The Hydra data could not be imported",
      detail:
        "Lorro Launcher will start with a fresh data folder. Your original Hydra data was not modified.",
      buttons: ["OK"],
    });
  }
};
