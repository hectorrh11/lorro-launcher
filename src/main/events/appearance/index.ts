import { app, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import { registerEvent } from "../register-event";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv"];

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

function getBackgroundsDirectory() {
  return path.join(app.getPath("userData"), "backgrounds");
}

async function removePreviousBackgrounds(directory: string, keep: string) {
  try {
    const entries = await fs.readdir(directory);

    await Promise.all(
      entries
        .filter((entry) => entry !== path.basename(keep))
        .map((entry) =>
          fs.rm(path.join(directory, entry), { force: true, recursive: true })
        )
    );
  } catch (error) {
    logger.warn("Could not clean previous background files", error);
  }
}

export interface ImportedBackground {
  kind: "image" | "video";
  path: string;
  width?: number;
  height?: number;
}

registerEvent("importBackgroundFile", async (): Promise<ImportedBackground | null> => {
  const window = WindowManager.mainWindow;

  const options: Electron.OpenDialogOptions = {
    title: "Choose a background",
    properties: ["openFile"],
    filters: [
      {
        name: "Images and videos",
        extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map((extension) =>
          extension.replace(".", "")
        ),
      },
      { name: "Images", extensions: IMAGE_EXTENSIONS.map((e) => e.replace(".", "")) },
      { name: "Videos", extensions: VIDEO_EXTENSIONS.map((e) => e.replace(".", "")) },
    ],
  };

  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths[0]) return null;

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  const directory = getBackgroundsDirectory();

  await fs.mkdir(directory, { recursive: true });

  const isVideo = VIDEO_EXTENSIONS.includes(extension);

  if (isVideo) {
    const target = path.join(directory, `background-${Date.now()}${extension}`);
    await fs.copyFile(sourcePath, target);
    await removePreviousBackgrounds(directory, target);

    return { kind: "video", path: target };
  }

  const target = path.join(directory, `background-${Date.now()}.jpg`);

  try {
    const image = sharp(sourcePath, { failOn: "none", animated: false });
    const metadata = await image.metadata();

    await image
      .rotate()
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: "cover",
        position: "attention",
        withoutEnlargement: false,
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(target);

    await removePreviousBackgrounds(directory, target);

    return {
      kind: "image",
      path: target,
      width: metadata.width ?? TARGET_WIDTH,
      height: metadata.height ?? TARGET_HEIGHT,
    };
  } catch (error) {
    logger.warn("Could not resize background, copying original file", error);

    const fallbackExtension = extension || ".png";
    const fallbackTarget = path.join(
      directory,
      `background-${Date.now()}${fallbackExtension}`
    );

    await fs.copyFile(sourcePath, fallbackTarget);
    await removePreviousBackgrounds(directory, fallbackTarget);

    return { kind: "image", path: fallbackTarget };
  }
});

registerEvent("setTitlebarTheme", (_event, theme: string) => {
  if (process.platform !== "win32") return;

  const window = WindowManager.mainWindow;
  if (!window || window.isDestroyed()) return;

  window.setTitleBarOverlay({
    symbolColor: theme === "light" ? "#1c1c1c" : "#DADBE1",
    color: "#00000000",
    height: 34,
  });
});
