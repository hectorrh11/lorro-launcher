import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import type {
  Game,
  SaveBackupConfig,
  SaveBackupEntry,
  SaveBackupGameConfig,
} from "@types";
import { readJson, writeJson } from "./advanced-store";
import { logger } from "./logger";

const CONFIG_FILE = "save-backup-config.json";
const GAMES_FILE = "save-backup-games.json";
const INDEX_FILE = "save-backup-index.json";
const META_FILE = "lorro-backup.json";

const DEFAULT_CONFIG: SaveBackupConfig = {
  destinationDir: null,
  maxCount: 10,
  maxAgeDays: 30,
  autoOnClose: true,
};

interface BackupMeta {
  gameKey: string;
  gameTitle: string;
  savePaths: string[];
}

const safeName = (value: string) =>
  value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120) || "game";

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function directorySize(target: string): Promise<number> {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    total += await directorySize(path.join(target, entry.name));
  }
  return total;
}

async function listFiles(root: string, base = root): Promise<string[]> {
  const stat = await fs.stat(root).catch(() => null);
  if (!stat) return [];
  if (!stat.isDirectory()) return [path.relative(base, root)];

  const result: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFiles(child, base)));
    } else {
      result.push(path.relative(base, child));
    }
  }
  return result;
}

async function manifestHash(filePaths: string[]): Promise<string> {
  const hash = crypto.createHash("sha1");
  for (const filePath of filePaths.sort()) {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) continue;
    hash.update(`${path.basename(filePath)}:${stat.size}:${stat.mtimeMs}\n`);
  }
  return hash.digest("hex");
}

export class SaveBackupManager {
  private config: SaveBackupConfig | null = null;
  private games: Record<string, SaveBackupGameConfig> | null = null;
  private index: SaveBackupEntry[] | null = null;

  private async getConfig(): Promise<SaveBackupConfig> {
    this.config ??= {
      ...DEFAULT_CONFIG,
      ...(await readJson<Partial<SaveBackupConfig>>(CONFIG_FILE, {})),
    };
    return this.config;
  }

  private async getGames(): Promise<Record<string, SaveBackupGameConfig>> {
    this.games ??= await readJson<Record<string, SaveBackupGameConfig>>(
      GAMES_FILE,
      {}
    );
    return this.games;
  }

  private async getIndex(): Promise<SaveBackupEntry[]> {
    this.index ??= await readJson<SaveBackupEntry[]>(INDEX_FILE, []);
    return this.index;
  }

  private async archiveRoot(): Promise<string> {
    const config = await this.getConfig();
    const root = config.destinationDir || path.join(app.getPath("userData"), "save-backups");
    await fs.mkdir(root, { recursive: true });
    return root;
  }

  async getGameConfig(gameKey: string): Promise<SaveBackupGameConfig> {
    const games = await this.getGames();
    return games[gameKey] ?? { savePaths: [] };
  }

  async setGameSavePaths(gameKey: string, savePaths: string[]) {
    const games = await this.getGames();
    games[gameKey] = {
      savePaths: savePaths.map((savePath) => path.resolve(savePath)).filter(Boolean),
    };
    await writeJson(GAMES_FILE, games);
  }

  async updateConfig(patch: Partial<SaveBackupConfig>) {
    const config = { ...(await this.getConfig()), ...patch };
    config.maxCount = Math.max(1, Math.min(500, Math.round(config.maxCount)));
    config.maxAgeDays = Math.max(0, Math.round(config.maxAgeDays));
    this.config = config;
    await writeJson(CONFIG_FILE, config);
    return config;
  }

  getConfigValue() {
    return this.getConfig();
  }

  detectSavePaths(game: Game): string[] {
    const home = app.getPath("home");
    const candidates = [
      path.join(home, "Documents", "My Games", game.title),
      path.join(home, "Documents", game.title),
      path.join(home, "Saved Games", game.title),
      path.join(app.getPath("appData"), game.title),
      path.join(app.getPath("userData").replace(/Lorro Launcher$/, ""), game.title),
      ...(game.executablePath
        ? [
            path.join(path.dirname(game.executablePath), "save"),
            path.join(path.dirname(game.executablePath), "saves"),
            path.join(path.dirname(game.executablePath), "SaveGames"),
          ]
        : []),
    ];

    return Array.from(new Set(candidates));
  }

  async createBackup(
    game: Game,
    reason: "manual" | "close" | "update" | "uninstall" | "pre-restore"
  ): Promise<SaveBackupEntry | null> {
    const key = `${game.shop}:${game.objectId}`;
    const { savePaths } = await this.getGameConfig(key);
    const existing: string[] = [];
    for (const savePath of savePaths) {
      if (await pathExists(savePath)) existing.push(savePath);
    }

    if (existing.length === 0) {
      logger.warn(`[save-backup] no existing save paths for ${key}`);
      return null;
    }

    const index = await this.getIndex();
    const files: string[] = [];
    const manifest: string[] = [];
    for (const savePath of existing) {
      const relativeFiles = await listFiles(savePath);
      for (const relativeFile of relativeFiles) {
        absoluteManifestPush(manifest, path.join(savePath, relativeFile));
        files.push(relativeFile);
      }
    }

    const hash = await manifestHash(manifest);
    const lastForGame = index.find((entry) => entry.gameKey === key);
    if (lastForGame && lastForGame.reason !== "pre-restore") {
      const lastMeta = await readJson<BackupMeta | null>(
        path.join(lastForGame.path, META_FILE),
        null
      );
      if (lastMeta && (await this.entryHash(lastForGame)) === hash) {
        return { ...lastForGame, skippedDuplicate: true };
      }
    }

    const id = randomUUID();
    const root = await this.archiveRoot();
    const entryPath = path.join(root, safeName(key), id);
    await fs.mkdir(entryPath, { recursive: true });

    let sizeBytes = 0;
    for (let i = 0; i < existing.length; i++) {
      const destination = path.join(entryPath, "payload", String(i));
      await fs.cp(existing[i], destination, { recursive: true });
      sizeBytes += await directorySize(destination);
    }

    const meta: BackupMeta = { gameKey: key, gameTitle: game.title, savePaths: existing };
    await fs.writeFile(path.join(entryPath, META_FILE), JSON.stringify(meta, null, 2));

    const entry: SaveBackupEntry = {
      id,
      gameKey: key,
      gameTitle: game.title,
      createdAt: new Date().toISOString(),
      reason,
      sizeBytes,
      files,
      path: entryPath,
    };

    index.unshift(entry);
    await this.prune(index);
    await writeJson(INDEX_FILE, index);
    logger.info(`[save-backup] created ${id} for ${key} (${sizeBytes} bytes)`);
    return entry;
  }

  private async entryHash(entry: SaveBackupEntry): Promise<string | null> {
    const meta = await readJson<BackupMeta | null>(
      path.join(entry.path, META_FILE),
      null
    );
    if (!meta) return null;
    const manifest: string[] = [];
    for (let i = 0; i < meta.savePaths.length; i++) {
      const root = path.join(entry.path, "payload", String(i));
      for (const relativeFile of await listFiles(root)) {
        absoluteManifestPush(manifest, path.join(root, relativeFile));
      }
    }
    return manifestHash(manifest);
  }

  private async prune(index: SaveBackupEntry[]) {
    const config = await this.getConfig();
    const cutoff = config.maxAgeDays > 0 ? Date.now() - config.maxAgeDays * 86_400_000 : 0;
    const keep: SaveBackupEntry[] = [];
    const perGame = new Map<string, number>();

    for (const entry of index) {
      const count = perGame.get(entry.gameKey) ?? 0;
      const expired = cutoff > 0 && new Date(entry.createdAt).getTime() < cutoff;
      const tooMany = count >= config.maxCount;

      if (expired || tooMany) {
        await fs.rm(entry.path, { recursive: true, force: true }).catch(() => undefined);
        logger.info(`[save-backup] pruned ${entry.id} (${entry.gameKey})`);
        continue;
      }

      perGame.set(entry.gameKey, count + 1);
      keep.push(entry);
    }

    index.splice(0, index.length, ...keep);
  }

  async listBackups(gameKey?: string) {
    const index = await this.getIndex();
    return gameKey ? index.filter((entry) => entry.gameKey === gameKey) : index;
  }

  async deleteBackup(id: string) {
    const index = await this.getIndex();
    const entry = index.find((item) => item.id === id);
    if (!entry) return false;
    await fs.rm(entry.path, { recursive: true, force: true }).catch(() => undefined);
    index.splice(index.indexOf(entry), 1);
    await writeJson(INDEX_FILE, index);
    return true;
  }

  async restoreBackup(id: string): Promise<{ restored: boolean; message?: string }> {
    const index = await this.getIndex();
    const entry = index.find((item) => item.id === id);
    if (!entry) return { restored: false, message: "Backup not found" };

    const meta = await readJson<BackupMeta | null>(
      path.join(entry.path, META_FILE),
      null
    );
    if (!meta) return { restored: false, message: "Backup metadata is missing" };

    for (let i = 0; i < meta.savePaths.length; i++) {
      const payload = path.join(entry.path, "payload", String(i));
      if (!(await pathExists(payload))) continue;
      await fs.mkdir(meta.savePaths[i], { recursive: true });
      await fs.cp(payload, meta.savePaths[i], { recursive: true, force: true });
    }

    logger.info(`[save-backup] restored ${id}`);
    return { restored: true };
  }

  async exportBackup(id: string, destinationDir: string) {
    const index = await this.getIndex();
    const entry = index.find((item) => item.id === id);
    if (!entry) return false;
    const target = path.join(destinationDir, `lorro-backup-${entry.id}.lorro`);
    await fs.cp(entry.path, target, { recursive: true });
    return true;
  }

  async importBackup(sourceDir: string) {
    const meta = await readJson<BackupMeta | null>(path.join(sourceDir, META_FILE), null);
    if (!meta) return null;

    const id = randomUUID();
    const root = await this.archiveRoot();
    const entryPath = path.join(root, safeName(meta.gameKey), id);
    await fs.cp(sourceDir, entryPath, { recursive: true });

    const entry: SaveBackupEntry = {
      id,
      gameKey: meta.gameKey,
      gameTitle: meta.gameTitle,
      createdAt: new Date().toISOString(),
      reason: "manual",
      sizeBytes: await directorySize(path.join(entryPath, "payload")),
      files: [],
      path: entryPath,
    };

    const index = await this.getIndex();
    index.unshift(entry);
    await writeJson(INDEX_FILE, index);
    return entry;
  }
}

function absoluteManifestPush(target: string[], value: string) {
  target.push(value);
}

export const saveBackupManager = new SaveBackupManager();
