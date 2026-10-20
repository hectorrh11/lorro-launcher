import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { StorageCacheEntry, StorageDrive, StorageGameEntry, StorageReport } from "@types";
import { gamesSublevel, levelKeys } from "@main/level";
import { getDiskUsage } from "./disk-usage";
import { logger } from "./logger";

async function directorySize(target: string): Promise<number> {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    total += await directorySize(path.join(target, entry.name));
  }
  return total;
}

const CACHE_DIRS = ["Cache", "GPUCache", "Code Cache", "DawnCache", "logs"];

export class StorageManager {
  async drives(): Promise<StorageDrive[]> {
    const drives: StorageDrive[] = [];
    for (let code = 67; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const root = `${letter}:\\`;
      const usage = await getDiskUsage(root);
      if (!usage) continue;
      drives.push({ path: root, label: `${letter}:`, total: usage.total, free: usage.free });
    }
    return drives;
  }

  async games(): Promise<StorageGameEntry[]> {
    const games = await gamesSublevel.values().all();
    const byTitle = new Map<string, string>();

    const entries: StorageGameEntry[] = [];
    for (const game of games) {
      if (game.isDeleted) continue;
      const gameKey = `${game.shop}:${game.objectId}`;
      const installPath = game.executablePath ? path.dirname(game.executablePath) : null;
      const sizeBytes = game.installedSizeInBytes
        ? game.installedSizeInBytes
        : installPath
          ? await directorySize(installPath)
          : 0;

      const normalized = game.title.trim().toLowerCase();
      const duplicateOf = byTitle.get(normalized) ?? null;
      if (!duplicateOf) byTitle.set(normalized, gameKey);

      entries.push({
        gameKey,
        title: game.title,
        shop: game.shop,
        installPath,
        sizeBytes,
        possibleDuplicateOf: duplicateOf,
      });
    }

    return entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }

  async caches(): Promise<StorageCacheEntry[]> {
    const userData = app.getPath("userData");
    const result: StorageCacheEntry[] = [];
    for (const dir of CACHE_DIRS) {
      const target = path.join(userData, dir);
      const stat = await fs.stat(target).catch(() => null);
      if (!stat?.isDirectory()) continue;
      result.push({
        id: dir,
        label: dir,
        path: target,
        sizeBytes: await directorySize(target),
        safeToClean: true,
      });
    }
    return result;
  }

  async report(): Promise<StorageReport> {
    const [drives, games, caches] = await Promise.all([
      this.drives(),
      this.games(),
      this.caches(),
    ]);
    return {
      drives,
      games,
      caches,
      totalGamesBytes: games.reduce((sum, game) => sum + game.sizeBytes, 0),
    };
  }

  async moveGame(
    gameKey: string,
    destinationRoot: string
  ): Promise<{ moved: boolean; message: string; newPath?: string }> {
    const [shop, ...rest] = gameKey.split(":");
    const objectId = rest.join(":");
    const game = await gamesSublevel.get(levelKeys.game(shop as Parameters<typeof levelKeys.game>[0], objectId));
    if (!game) return { moved: false, message: "Game not found" };
    if (!game.executablePath) {
      return { moved: false, message: "This game has no known installation folder." };
    }

    const sourceDir = path.dirname(game.executablePath);
    const targetDir = path.join(destinationRoot, path.basename(sourceDir));

    if (path.resolve(sourceDir).toLowerCase() === path.resolve(targetDir).toLowerCase()) {
      return { moved: false, message: "The game is already in that folder." };
    }

    const sourceUsage = await getDiskUsage(sourceDir);
    const destinationUsage = await getDiskUsage(destinationRoot);
    const size = game.installedSizeInBytes ?? (await directorySize(sourceDir));

    if (!destinationUsage) {
      return { moved: false, message: "The destination drive is not available." };
    }
    if (destinationUsage.free < size * 1.05) {
      return { moved: false, message: "Not enough free space at the destination." };
    }
    if (await fs.stat(targetDir).catch(() => null)) {
      return { moved: false, message: "A folder with that name already exists there." };
    }
    if (!sourceUsage) {
      return { moved: false, message: "The current installation folder is not accessible." };
    }

    try {
      await fs.mkdir(destinationRoot, { recursive: true });
      await fs.cp(sourceDir, targetDir, { recursive: true, errorOnExist: true });

      const copiedSize = await directorySize(targetDir);
      if (copiedSize < size * 0.98) {
        await fs.rm(targetDir, { recursive: true, force: true });
        return { moved: false, message: "The copy was incomplete. Nothing was changed." };
      }

      const newExecutable = path.join(targetDir, path.relative(sourceDir, game.executablePath));
      if (!(await fs.stat(newExecutable).catch(() => null))) {
        await fs.rm(targetDir, { recursive: true, force: true });
        return { moved: false, message: "The executable was not found after copying." };
      }

      await gamesSublevel.put(levelKeys.game(shop as Parameters<typeof levelKeys.game>[0], objectId), {
        ...game,
        executablePath: newExecutable,
        executablePathUpdatedAt: new Date(),
        installedSizeInBytes: copiedSize,
      });

      await fs.rm(sourceDir, { recursive: true, force: true }).catch((error) => {
        logger.warn(`[storage] copied but could not remove ${sourceDir}: ${error}`);
      });

      return { moved: true, message: "Game moved successfully.", newPath: targetDir };
    } catch (error) {
      logger.error("[storage] move failed", error);
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
      return { moved: false, message: "The move failed. The original installation was kept." };
    }
  }

  async cleanCaches(ids: string[]): Promise<{ cleaned: string[]; freedBytes: number }> {
    const caches = await this.caches();
    const cleaned: string[] = [];
    let freedBytes = 0;

    for (const cache of caches) {
      if (!ids.includes(cache.id) || !cache.safeToClean) continue;
      await fs.rm(cache.path, { recursive: true, force: true });
      cleaned.push(cache.id);
      freedBytes += cache.sizeBytes;
      logger.info(`[storage] cleaned cache ${cache.path}`);
    }

    return { cleaned, freedBytes };
  }
}

export const storageManager = new StorageManager();
