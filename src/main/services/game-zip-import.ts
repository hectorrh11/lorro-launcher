import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { MINIMUM_FREE_DISK_SPACE_BYTES, Downloader } from "@shared";
import type {
  Download,
  GameZipImportError,
  GameZipImportInspection,
  GameZipImportOptions,
  GameZipImportPhase,
  GameZipImportProgress,
  GameZipImportResult,
  GameZipInspectionResult,
} from "@types";
import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { flattenRedundantDirectories } from "@main/helpers/flatten-directory";
import { downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { getDiskUsage } from "./disk-usage";
import { GameFilesManager } from "./game-files-manager";
import { logger } from "./logger";
import { SevenZip } from "./7zip";
import { WindowManager } from "./window-manager";

class GameZipImportFailure extends Error {
  constructor(
    readonly code: GameZipImportError,
    message?: string
  ) {
    super(message ?? code);
  }
}

const failed = (
  error: GameZipImportError,
  message?: string
): GameZipImportResult => ({
  ok: false,
  error,
  message,
});

const clampProgress = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const isUnsafeEntryName = (entryName: string) => {
  if (!entryName || entryName.includes("\0")) return true;

  const normalized = entryName.replace(/\\/g, "/");

  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return true;
  }

  return false;
};

const sanitizeFileName = (fileName: string) => {
  const sanitized = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!sanitized) return "game.zip";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(sanitized)) {
    return `_${sanitized}`;
  }

  return sanitized;
};

const fileExists = (filePath: string) =>
  fsPromises
    .access(filePath)
    .then(() => true)
    .catch(() => false);

const isPathInside = (parentPath: string, childPath: string) => {
  const relative = path.relative(parentPath, childPath);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
};

const mapError = (error: unknown): GameZipImportError => {
  if (error instanceof GameZipImportFailure) return error.code;

  if (error instanceof Error && error.name === "AbortError") {
    return "cancelled";
  }

  const code = (error as NodeJS.ErrnoException)?.code;

  if (code === "ENOENT") return "file-not-found";
  if (code === "ENOSPC") return "no-space";
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return "permission-denied";
  }

  return "unknown";
};

class GameZipImportManager {
  private readonly operations = new Map<string, AbortController>();

  async inspect(
    _shop: GameZipImportOptions["shop"],
    _objectId: string,
    zipPath: string
  ): Promise<GameZipInspectionResult> {
    try {
      if (!zipPath || !path.isAbsolute(zipPath)) {
        return {
          ok: false,
          error: "file-not-found",
          message: "The selected file path is not absolute.",
        };
      }

      if (path.extname(zipPath).toLowerCase() !== ".zip") {
        return {
          ok: false,
          error: "invalid-zip",
          message: "Only ZIP archives can be imported.",
        };
      }

      const fileStats = await fsPromises.stat(zipPath).catch(() => null);

      if (!fileStats?.isFile()) {
        return {
          ok: false,
          error: "file-not-found",
          message: "The selected ZIP file does not exist.",
        };
      }

      const entries = await SevenZip.listEntries(zipPath).catch((error) => {
        throw new GameZipImportFailure("invalid-zip", String(error));
      });

      if (entries.length === 0) {
        return {
          ok: false,
          error: "invalid-zip",
          message: "The ZIP archive is empty or unreadable.",
        };
      }

      if (entries.some((entry) => entry.encrypted)) {
        return {
          ok: false,
          error: "encrypted-zip",
          message: "Password protected ZIP archives are not supported.",
        };
      }

      if (entries.some((entry) => isUnsafeEntryName(entry.name))) {
        return {
          ok: false,
          error: "unsafe-archive",
          message: "The ZIP archive contains an unsafe file path.",
        };
      }

      const destinationRoot = await getDownloadsPath();
      await fsPromises.mkdir(destinationRoot, { recursive: true });

      const safeFileName = sanitizeFileName(path.basename(zipPath));
      const destinationZipPath = path.join(destinationRoot, safeFileName);
      const extractionPath = path.join(
        destinationRoot,
        path.parse(safeFileName).name
      );

      const conflicts: GameZipImportInspection["conflicts"] = [];
      const sourceResolved = path.resolve(zipPath);
      const destinationResolved = path.resolve(destinationZipPath);

      if (
        destinationResolved !== sourceResolved &&
        (await fileExists(destinationZipPath))
      ) {
        conflicts.push("zip");
      }

      if (await fileExists(extractionPath)) {
        conflicts.push("folder");
      }

      const diskUsage = await getDiskUsage(destinationRoot);

      return {
        ok: true,
        inspection: {
          sourcePath: zipPath,
          fileName: path.basename(zipPath),
          fileSize: fileStats.size,
          entryCount: entries.length,
          extractedBytes: entries.reduce(
            (total, entry) => total + Math.max(0, entry.size),
            0
          ),
          destinationRoot,
          destinationZipPath,
          extractionPath,
          conflicts,
          freeBytes: diskUsage?.free ?? null,
        },
      };
    } catch (error) {
      logger.error("[GameZipImport] Inspection failed", error);

      return {
        ok: false,
        error: mapError(error),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async import(options: GameZipImportOptions): Promise<GameZipImportResult> {
    if (!options.operationId) {
      return failed("unknown", "Missing import operation id.");
    }

    if (this.operations.has(options.operationId)) {
      return failed("unknown", "This import is already running.");
    }

    const controller = new AbortController();
    this.operations.set(options.operationId, controller);

    try {
      return await this.runImport(options, controller.signal);
    } catch (error) {
      logger.error("[GameZipImport] Import failed", error);
      return failed(
        mapError(error),
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.operations.delete(options.operationId);
    }
  }

  cancel(operationId: string): boolean {
    const controller = this.operations.get(operationId);
    if (!controller) return false;

    controller.abort(new DOMException("Import cancelled", "AbortError"));
    return true;
  }

  private emitProgress(
    options: GameZipImportOptions,
    phase: GameZipImportPhase,
    progress: number,
    detail?: string | null
  ) {
    const payload: GameZipImportProgress = {
      operationId: options.operationId,
      shop: options.shop,
      objectId: options.objectId,
      phase,
      progress: clampProgress(progress),
      detail: detail ?? null,
    };

    WindowManager.sendToAppWindows("on-game-zip-import-progress", payload);
  }

  private async runImport(
    options: GameZipImportOptions,
    signal: AbortSignal
  ): Promise<GameZipImportResult> {
    const gameKey = levelKeys.game(options.shop, options.objectId);
    const game = await gamesSublevel.get(gameKey);

    if (!game || game.isDeleted) {
      return failed("game-not-found");
    }

    if (game.executablePath) {
      return failed("already-installed");
    }

    this.emitProgress(options, "preparing", 0);

    const inspectionResult = await this.inspect(
      options.shop,
      options.objectId,
      options.zipPath
    );

    if (!inspectionResult.ok || !inspectionResult.inspection) {
      return failed(
        inspectionResult.error ?? "invalid-zip",
        inspectionResult.message
      );
    }

    const inspection = inspectionResult.inspection;
    const sourcePath = path.resolve(options.zipPath);
    const destinationPath = path.resolve(inspection.destinationZipPath);
    const samePath = sourcePath === destinationPath;
    const existingDownload = await downloadsSublevel.get(gameKey);

    if (
      existingDownload &&
      existingDownload.progress < 1 &&
      ["active", "waiting", "paused", "extracting"].includes(
        existingDownload.status ?? ""
      )
    ) {
      return failed(
        "destination-conflict",
        "A download is already running for this game."
      );
    }

    if (inspection.conflicts.length > 0 && !options.overwrite) {
      return failed("destination-conflict");
    }

    const sourceVolumeRoot = path.parse(sourcePath).root.toLowerCase();
    const destinationVolumeRoot = path
      .parse(inspection.destinationRoot)
      .root.toLowerCase();
    const needsFileTransfer =
      !samePath &&
      (options.mode === "copy" || sourceVolumeRoot !== destinationVolumeRoot);

    const requiredBytes =
      inspection.extractedBytes +
      (needsFileTransfer ? inspection.fileSize : 0) +
      MINIMUM_FREE_DISK_SPACE_BYTES;

    if (inspection.freeBytes !== null && requiredBytes > inspection.freeBytes) {
      return failed("no-space");
    }

    if (inspection.conflicts.includes("folder")) {
      if (isPathInside(inspection.extractionPath, sourcePath)) {
        return failed(
          "destination-conflict",
          "The selected ZIP is inside the folder that would be overwritten."
        );
      }
    }

    let zipBackupPath: string | null = null;

    if (inspection.conflicts.includes("zip") && !samePath) {
      zipBackupPath = `${inspection.destinationZipPath}.lorro-backup-${Date.now()}`;

      await fsPromises.rename(inspection.destinationZipPath, zipBackupPath);
    }

    signal.throwIfAborted();

    let originalMoved = false;

    try {
      if (!samePath) {
        if (options.mode === "copy") {
          await this.transferFile(
            options,
            options.zipPath,
            inspection.destinationZipPath,
            inspection.fileSize,
            "copying",
            signal
          );
        } else {
          this.emitProgress(options, "moving", 0);
          const sourceStats = await fsPromises.stat(options.zipPath);

          try {
            await fsPromises.rename(
              options.zipPath,
              inspection.destinationZipPath
            );
            originalMoved = true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
              throw error;
            }

            await this.transferFile(
              options,
              options.zipPath,
              inspection.destinationZipPath,
              sourceStats.size,
              "moving",
              signal
            );
            await fsPromises.unlink(options.zipPath).then(
              () => {
                originalMoved = true;
              },
              (unlinkError) => {
                logger.warn(
                  "[GameZipImport] Could not remove the original ZIP after moving",
                  unlinkError
                );
              }
            );
          }
        }
      }
    } catch (error) {
      if (zipBackupPath) {
        await fsPromises
          .rename(zipBackupPath, inspection.destinationZipPath)
          .catch((restoreError) => {
            logger.error(
              "[GameZipImport] Could not restore the previous ZIP after a failed transfer",
              restoreError
            );
          });
      }

      throw error;
    }

    if (zipBackupPath) {
      await fsPromises.rm(zipBackupPath, { force: true }).catch((error) => {
        logger.warn(
          "[GameZipImport] Could not remove the previous ZIP backup",
          error
        );
      });
    }

    if (inspection.conflicts.includes("folder")) {
      await fsPromises.rm(inspection.extractionPath, {
        recursive: true,
        force: true,
      });
    }

    signal.throwIfAborted();

    const downloadRecord: Download = {
      shop: options.shop,
      objectId: options.objectId,
      uri: inspection.destinationZipPath,
      folderName: path.basename(inspection.destinationZipPath),
      downloadPath: inspection.destinationRoot,
      progress: 1,
      downloader: Downloader.Custom,
      bytesDownloaded: inspection.fileSize,
      fileSize: inspection.fileSize,
      shouldSeed: false,
      status: "complete",
      queued: false,
      timestamp: Date.now(),
      extracting: options.extractAutomatically,
      automaticallyExtract: options.extractAutomatically,
      automaticallyDeleteArchiveFiles: options.deleteZipAfterExtraction,
    };

    await downloadsSublevel.put(gameKey, downloadRecord);
    WindowManager.sendDownloadsUpdated();

    if (!options.extractAutomatically) {
      this.emitProgress(options, "done", 1);
      return {
        ok: true,
        destinationPath: inspection.destinationZipPath,
        installed: false,
      };
    }

    let extractionStarted = false;
    let extractionCompleted = false;
    let lastProgressEmit = 0;

    try {
      this.emitProgress(options, "extracting", 0);
      await fsPromises.mkdir(inspection.extractionPath, { recursive: true });
      extractionStarted = true;

      await SevenZip.extractFile(
        {
          filePath: inspection.destinationZipPath,
          outputPath: inspection.extractionPath,
          passwords: ["online-fix.me", "steamrip.com"],
          signal,
        },
        (progress) => {
          const now = Date.now();
          if (now - lastProgressEmit < 120 && progress.percent < 100) return;
          lastProgressEmit = now;
          this.emitProgress(
            options,
            "extracting",
            clampProgress(progress.percent / 100),
            progress.file || null
          );
        }
      );

      signal.throwIfAborted();
      this.emitProgress(options, "verifying", 0);
      await this.verifyExtractedFiles(
        inspection.extractionPath,
        inspection.destinationZipPath,
        signal
      );

      const nestedArchivesExtracted = await new GameFilesManager(
        options.shop,
        options.objectId
      ).extractFilesInDirectory(
        inspection.extractionPath,
        inspection.destinationZipPath
      );

      if (!nestedArchivesExtracted) {
        throw new GameZipImportFailure("extract-failed");
      }

      signal.throwIfAborted();
      await flattenRedundantDirectories(inspection.extractionPath);
      extractionCompleted = true;

      await downloadsSublevel.put(gameKey, {
        ...downloadRecord,
        folderName: path.basename(inspection.extractionPath),
      });

      this.emitProgress(options, "detecting-executable", 0);
      await new GameFilesManager(
        options.shop,
        options.objectId
      ).setExtractionComplete(false);

      const updatedGame = await gamesSublevel.get(gameKey);
      const installed = Boolean(updatedGame?.executablePath);

      if (
        options.deleteZipAfterExtraction &&
        !(options.mode === "copy" && samePath)
      ) {
        await fsPromises
          .rm(inspection.destinationZipPath, { force: true })
          .catch((error) => {
            logger.warn(
              "[GameZipImport] Could not delete the ZIP after extraction",
              error
            );
          });
      }

      this.emitProgress(options, "done", 1);

      return {
        ok: true,
        destinationPath: inspection.extractionPath,
        installed,
      };
    } catch (error) {
      const mappedError = mapError(error);

      if (extractionCompleted) {
        const currentGame = await gamesSublevel.get(gameKey).catch(() => null);

        if (currentGame?.executablePath) {
          this.emitProgress(options, "done", 1);

          return {
            ok: true,
            destinationPath: inspection.extractionPath,
            installed: true,
          };
        }
      }

      if (extractionStarted && !extractionCompleted) {
        await fsPromises
          .rm(inspection.extractionPath, { recursive: true, force: true })
          .catch(() => undefined);
      }

      await downloadsSublevel
        .put(gameKey, {
          ...downloadRecord,
          extracting: false,
        })
        .catch(() => undefined);

      WindowManager.sendDownloadsUpdated();

      if (originalMoved) {
        logger.info(
          "[GameZipImport] The moved ZIP was kept after a failed import"
        );
      }

      logger.error("[GameZipImport] Extraction failed", error);

      return failed(
        mappedError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async transferFile(
    options: GameZipImportOptions,
    sourcePath: string,
    destinationPath: string,
    fileSize: number,
    phase: "copying" | "moving",
    signal: AbortSignal
  ): Promise<void> {
    const partialPath = `${destinationPath}.lorro-partial`;

    await fsPromises.rm(partialPath, { force: true });
    await fsPromises.rm(destinationPath, { force: true });

    let copiedBytes = 0;
    let lastEmit = 0;
    const readStream = fs.createReadStream(sourcePath);

    readStream.on("data", (chunk) => {
      copiedBytes += chunk.length;
      const now = Date.now();

      if (now - lastEmit < 120 && copiedBytes < fileSize) return;
      lastEmit = now;
      this.emitProgress(
        options,
        phase,
        fileSize > 0 ? copiedBytes / fileSize : 0
      );
    });

    try {
      await pipeline(
        readStream,
        fs.createWriteStream(partialPath, { flags: "wx" }),
        { signal }
      );

      const transferredStats = await fsPromises.stat(partialPath);

      if (transferredStats.size !== fileSize) {
        throw new GameZipImportFailure(
          "verify-failed",
          "The copied ZIP size does not match the original."
        );
      }

      await fsPromises.rename(partialPath, destinationPath);
      this.emitProgress(options, phase, 1);
    } catch (error) {
      readStream.destroy();
      await fsPromises.rm(partialPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async verifyExtractedFiles(
    extractionPath: string,
    zipPath: string,
    signal: AbortSignal
  ): Promise<void> {
    const entries = await SevenZip.listEntries(zipPath);

    for (let index = 0; index < entries.length; index += 64) {
      signal.throwIfAborted();

      const chunk = entries.slice(index, index + 64);
      const results = await Promise.all(
        chunk.map(async (entry) => {
          const segments = entry.name.replace(/\\/g, "/").split("/");
          const entryPath = path.join(extractionPath, ...segments);

          if (
            path.resolve(entryPath) !== path.resolve(extractionPath) &&
            !path
              .resolve(entryPath)
              .startsWith(`${path.resolve(extractionPath)}${path.sep}`)
          ) {
            return false;
          }

          const stats = await fsPromises.lstat(entryPath).catch(() => null);
          return Boolean(stats?.isFile());
        })
      );

      if (results.some((result) => !result)) {
        throw new GameZipImportFailure(
          "verify-failed",
          "Some files could not be verified after extraction."
        );
      }
    }

    if (await this.containsSymbolicLink(extractionPath, signal)) {
      throw new GameZipImportFailure(
        "unsafe-archive",
        "The archive created symbolic links."
      );
    }
  }

  private async containsSymbolicLink(
    rootPath: string,
    signal: AbortSignal
  ): Promise<boolean> {
    const pending = [rootPath];

    while (pending.length > 0) {
      signal.throwIfAborted();

      const currentPath = pending.pop()!;
      const entries = await fsPromises.readdir(currentPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (entry.isSymbolicLink()) return true;
        if (entry.isDirectory()) {
          pending.push(path.join(currentPath, entry.name));
        }
      }
    }

    return false;
  }
}

export const gameZipImportManager = new GameZipImportManager();
