import { globalShortcut, shell, app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { db, levelKeys } from "@main/level";
import { WindowManager } from "./window-manager";
import { logger } from "./logger";
import type {
  LorroClipInfo,
  LorroClipSettings,
  UserPreferences,
} from "@types";

const DEFAULT_HOTKEY = "Control+Shift+X";
const DEFAULT_DURATION_SECONDS = 30;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 90;
const DURATION_STEP_SECONDS = 5;

const clampDuration = (value: number) => {
  const rounded = Math.round(value / DURATION_STEP_SECONDS) * DURATION_STEP_SECONDS;
  return Math.min(
    MAX_DURATION_SECONDS,
    Math.max(MIN_DURATION_SECONDS, rounded)
  );
};

const clipsDirectory = () =>
  path.join(app.getPath("videos"), "Lorro Launcher", "Clips");

class ClipManager {
  private registeredHotkey: string | null = null;

  private async getPreferences(): Promise<UserPreferences | null> {
    return db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
  }

  async getSettings(): Promise<LorroClipSettings> {
    const preferences = await this.getPreferences();
    const settings: LorroClipSettings = {
      enabled: preferences?.clipsEnabled ?? false,
      hotkey: preferences?.clipsHotkey?.trim() || DEFAULT_HOTKEY,
      durationSeconds: clampDuration(
        preferences?.clipsDurationSeconds ?? DEFAULT_DURATION_SECONDS
      ),
      systemAudio: preferences?.clipsSystemAudio ?? true,
      microphone: preferences?.clipsMicrophone ?? false,
    };

    return {
      ...settings,
      registered: this.registeredHotkey === settings.hotkey,
    };
  }

  private applyHotkey(settings: LorroClipSettings): {
    ok: boolean;
    message: string;
  } {
    if (this.registeredHotkey) {
      globalShortcut.unregister(this.registeredHotkey);
      this.registeredHotkey = null;
    }

    if (!settings.enabled) {
      return { ok: true, message: "" };
    }

    if (!settings.hotkey) {
      return { ok: false, message: "Choose a shortcut for clips." };
    }

    try {
      const registered = globalShortcut.register(settings.hotkey, () => {
        WindowManager.sendToAppWindows("on-clip-save-request");
      });

      if (!registered) {
        logger.warn(`[clips] could not register hotkey ${settings.hotkey}`);
        return {
          ok: false,
          message:
            "That shortcut is already used by another application. Choose another one.",
        };
      }

      this.registeredHotkey = settings.hotkey;
      return { ok: true, message: "" };
    } catch (error) {
      logger.error("[clips] failed to register hotkey", error);
      return { ok: false, message: "That shortcut is not valid." };
    }
  }

  async updateSettings(patch: Partial<LorroClipSettings>): Promise<{
    ok: boolean;
    message: string;
    settings: LorroClipSettings;
  }> {
    const preferences = await this.getPreferences();
    const current = await this.getSettings();

    const next: LorroClipSettings = {
      enabled: patch.enabled ?? current.enabled,
      hotkey: (patch.hotkey ?? current.hotkey).trim() || DEFAULT_HOTKEY,
      durationSeconds: clampDuration(
        patch.durationSeconds ?? current.durationSeconds
      ),
      systemAudio: patch.systemAudio ?? current.systemAudio,
      microphone: patch.microphone ?? current.microphone,
    };

    const registration = this.applyHotkey(next);

    if (preferences) {
      await db.put<string, UserPreferences>(
        levelKeys.userPreferences,
        {
          ...preferences,
          clipsEnabled: next.enabled,
          clipsHotkey: next.hotkey,
          clipsDurationSeconds: next.durationSeconds,
          clipsSystemAudio: next.systemAudio,
          clipsMicrophone: next.microphone,
        },
        { valueEncoding: "json" }
      );
    }

    const settings: LorroClipSettings = {
      ...next,
      registered: this.registeredHotkey === next.hotkey,
    };

    WindowManager.sendToAppWindows("on-clip-settings-updated", settings);

    return {
      ok: registration.ok,
      message: registration.message,
      settings,
    };
  }

  async initialize(): Promise<void> {
    const settings = await this.getSettings();
    const result = this.applyHotkey(settings);
    if (!result.ok) logger.warn(`[clips] ${result.message}`);
  }

  dispose(): void {
    if (this.registeredHotkey) {
      globalShortcut.unregister(this.registeredHotkey);
      this.registeredHotkey = null;
    }
  }

  async listClips(): Promise<LorroClipInfo[]> {
    const directory = clipsDirectory();

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const clips: LorroClipInfo[] = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(webm|mp4)$/i.test(entry.name)) continue;

        const filePath = path.join(directory, entry.name);
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats) continue;

        clips.push({
          name: entry.name,
          path: filePath,
          url: `local:${filePath.replace(/\\/g, "/")}`,
          sizeBytes: stats.size,
          createdAt: (stats.birthtime ?? stats.mtime).toISOString(),
        });
      }

      return clips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      logger.error("[clips] failed to list clips", error);
      return [];
    }
  }

  private resolveClipPath(name: string): string | null {
    const base = path.basename(name);
    if (base !== name) return null;
    if (!/\.(webm|mp4)$/i.test(base)) return null;
    return path.join(clipsDirectory(), base);
  }

  async deleteClip(name: string): Promise<{ ok: boolean; message: string }> {
    const filePath = this.resolveClipPath(name);
    if (!filePath) return { ok: false, message: "Invalid clip." };

    try {
      await fs.unlink(filePath);
      return { ok: true, message: "" };
    } catch (error) {
      logger.error("[clips] failed to delete clip", error);
      return { ok: false, message: "Could not delete the clip." };
    }
  }

  async revealClip(name: string): Promise<{ ok: boolean; message: string }> {
    const filePath = this.resolveClipPath(name);
    if (!filePath) return { ok: false, message: "Invalid clip." };

    try {
      await fs.access(filePath);
      shell.showItemInFolder(filePath);
      return { ok: true, message: "" };
    } catch (error) {
      logger.error("[clips] failed to reveal clip", error);
      return { ok: false, message: "The clip no longer exists." };
    }
  }

  async openFolder(): Promise<{ ok: boolean; message: string }> {
    const directory = clipsDirectory();
    try {
      await fs.mkdir(directory, { recursive: true });
      await shell.openPath(directory);
      return { ok: true, message: "" };
    } catch (error) {
      logger.error("[clips] failed to open clips folder", error);
      return { ok: false, message: "Could not open the clips folder." };
    }
  }

  async saveClip(
    data: ArrayBuffer,
    extension: string
  ): Promise<{ ok: boolean; message: string; path: string | null }> {
    try {
      const directory = clipsDirectory();
      await fs.mkdir(directory, { recursive: true });

      const safeExtension = extension === "mp4" ? "mp4" : "webm";
      const filePath = path.join(
        directory,
        `lorro-clip-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.${safeExtension}`
      );

      await fs.writeFile(filePath, Buffer.from(data));
      return { ok: true, message: "", path: filePath };
    } catch (error) {
      logger.error("[clips] failed to save clip", error);
      return { ok: false, message: "Could not save the clip.", path: null };
    }
  }
}

export const clipManager = new ClipManager();
