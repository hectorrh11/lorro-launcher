import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { DiagnosticCheck, DiagnosticReport, Game } from "@types";
import { getDiskUsage } from "./disk-usage";
import { saveBackupManager } from "./save-backup-manager";

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readRecentErrors(): Promise<string[]> {
  const file = path.join(app.getPath("userData"), "logs", "error.txt");
  try {
    const content = await fs.readFile(file, "utf8");
    return content.split(/\r?\n/).filter(Boolean).slice(-20);
  } catch {
    return [];
  }
}

export class GameDiagnostics {
  async run(game: Game): Promise<DiagnosticReport> {
    const gameKey = `${game.shop}:${game.objectId}`;
    const checks: DiagnosticCheck[] = [];
    const executablePath = game.executablePath ?? null;

    if (!executablePath) {
      checks.push({
        id: "executable",
        label: "Executable",
        status: "warning",
        message:
          "No executable configured yet. Set it from the library card or the game options.",
      });
    } else if (!(await exists(executablePath))) {
      checks.push({
        id: "executable",
        label: "Executable",
        status: "error",
        message: `The configured executable does not exist: ${executablePath}`,
      });
    } else {
      try {
        await fs.access(executablePath, fs.constants.R_OK);
        checks.push({
          id: "executable",
          label: "Executable",
          status: "ok",
          message: "The executable exists and can be read.",
        });
      } catch {
        checks.push({
          id: "executable",
          label: "Executable",
          status: "error",
          message: "The executable exists but cannot be read. Check permissions.",
        });
      }
    }

    if (executablePath) {
      const installPath = path.dirname(executablePath);
      const usage = await getDiskUsage(installPath);
      if (usage) {
        const freeGb = usage.free / 1024 ** 3;
        checks.push({
          id: "free-space",
          label: "Free space",
          status: freeGb < 1 ? "warning" : "ok",
          message: `${freeGb.toFixed(1)} GB free on the installation drive.`,
        });
      }
    }

    const saveConfig = await saveBackupManager.getGameConfig(gameKey);
    checks.push({
      id: "save-path",
      label: "Save backups",
      status: saveConfig.savePaths.length ? "ok" : "unknown",
      message: saveConfig.savePaths.length
        ? `${saveConfig.savePaths.length} save folder(s) configured.`
        : "No save folders configured. Automatic detection is limited; set them manually.",
    });

    const errors = await readRecentErrors();
    checks.push({
      id: "logs",
      label: "Lorro logs",
      status: errors.length ? "warning" : "ok",
      message: errors.length
        ? `${errors.length} recent log line(s) found. Review the logs if something failed.`
        : "No recent errors logged.",
    });

    return { gameKey, checkedAt: new Date().toISOString(), checks };
  }

  async fix(game: Game, checkId: string): Promise<{ fixed: boolean; message: string }> {
    if (checkId === "save-path") {
      const paths = saveBackupManager.detectSavePaths(game);
      const existing: string[] = [];
      for (const candidate of paths) {
        try {
          const stat = await fs.stat(candidate);
          if (stat.isDirectory()) existing.push(candidate);
        } catch {
          // ignore
        }
      }
      await saveBackupManager.setGameSavePaths(
        `${game.shop}:${game.objectId}`,
        existing
      );
      return {
        fixed: true,
        message: existing.length
          ? `Detected ${existing.length} existing save folder(s).`
          : "No save folders were detected. Set them manually.",
      };
    }

    return {
      fixed: false,
      message:
        "This check needs a manual decision. Lorro will never modify or delete your files automatically.",
    };
  }
}

export const gameDiagnostics = new GameDiagnostics();
