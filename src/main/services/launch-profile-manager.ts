import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchProfile, LaunchProfileValidation, LaunchToolStep } from "@types";
import { readJson, writeJson } from "./advanced-store";
import { logger } from "./logger";

const FILE = "launch-profiles.json";

type Store = Record<string, LaunchProfile[]>;

let cache: Store | null = null;

export function parseArguments(raw: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

function quoteForDisplay(value: string) {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function buildLaunchCommand(profile: LaunchProfile) {
  return [
    quoteForDisplay(profile.executablePath),
    ...parseArguments(profile.arguments).map(quoteForDisplay),
  ].join(" ");
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function spawnTool(step: LaunchToolStep) {
  if (!step.path) return;
  const child = spawn(step.path, parseArguments(step.arguments ?? ""), {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", (error) => logger.warn(`[launch-profile] tool failed: ${error.message}`));
  child.unref();
}

class LaunchProfileManager {
  private async load(): Promise<Store> {
    if (!cache) cache = await readJson<Store>(FILE, {});
    return cache;
  }

  private async persist() {
    if (cache) await writeJson(FILE, cache);
  }

  async list(gameKey: string): Promise<LaunchProfile[]> {
    const store = await this.load();
    return store[gameKey] ?? [];
  }

  async save(gameKey: string, profile: LaunchProfile): Promise<LaunchProfile[]> {
    const store = await this.load();
    const profiles = (store[gameKey] ??= []).slice();

    const normalized: LaunchProfile = {
      ...profile,
      id: profile.id || randomUUID(),
      name: profile.name.trim() || "Profile",
      environment: profile.environment ?? {},
      externalTools: profile.externalTools ?? [],
      preLaunch: profile.preLaunch ?? [],
    };

    const index = profiles.findIndex((item) => item.id === normalized.id);
    if (index >= 0) profiles[index] = normalized;
    else profiles.push(normalized);

    if (normalized.isDefault) {
      for (const item of profiles) item.isDefault = item.id === normalized.id;
    } else if (!profiles.some((item) => item.isDefault)) {
      profiles[0].isDefault = true;
    }

    store[gameKey] = profiles;
    await this.persist();
    return profiles;
  }

  async remove(gameKey: string, profileId: string): Promise<LaunchProfile[]> {
    const store = await this.load();
    const profiles = (store[gameKey] ?? []).filter((item) => item.id !== profileId);
    if (profiles.length && !profiles.some((item) => item.isDefault)) {
      profiles[0].isDefault = true;
    }
    store[gameKey] = profiles;
    await this.persist();
    return profiles;
  }

  async duplicate(gameKey: string, profileId: string): Promise<LaunchProfile[]> {
    const store = await this.load();
    const original = (store[gameKey] ?? []).find((item) => item.id === profileId);
    if (!original) return store[gameKey] ?? [];

    return this.save(gameKey, {
      ...original,
      id: randomUUID(),
      name: `${original.name} copy`,
      isDefault: false,
    });
  }

  async setDefault(gameKey: string, profileId: string): Promise<LaunchProfile[]> {
    const store = await this.load();
    for (const item of store[gameKey] ?? []) item.isDefault = item.id === profileId;
    await this.persist();
    return store[gameKey] ?? [];
  }

  async validate(profile: LaunchProfile): Promise<LaunchProfileValidation> {
    const messages: string[] = [];
    const executableExists = Boolean(profile.executablePath) && (await pathExists(profile.executablePath));
    if (!profile.executablePath) messages.push("The executable path is empty.");
    else if (!executableExists) messages.push("The executable does not exist at the configured path.");

    const workingDirectoryExists = profile.workingDirectory
      ? await pathExists(profile.workingDirectory)
      : true;
    if (!workingDirectoryExists) messages.push("The working directory does not exist.");

    for (const tool of [...(profile.preLaunch ?? []), ...(profile.externalTools ?? [])]) {
      if (tool.path && !(await pathExists(tool.path))) {
        messages.push(`Tool not found: ${tool.path}`);
      }
    }

    return {
      valid: messages.length === 0,
      executableExists,
      workingDirectoryExists,
      messages,
    };
  }

  async launch(gameKey: string, profileId?: string) {
    const store = await this.load();
    const profiles = store[gameKey] ?? [];
    const profile = profileId
      ? profiles.find((item) => item.id === profileId)
      : profiles.find((item) => item.isDefault) ?? profiles[0];

    if (!profile) throw new Error("No launch profile configured for this game.");

    const validation = await this.validate(profile);
    if (!validation.executableExists) {
      throw new Error(validation.messages[0] ?? "The executable could not be found.");
    }

    for (const step of profile.preLaunch ?? []) {
      await spawnTool(step);
    }

    const command = buildLaunchCommand(profile);
    logger.info(`[launch-profile] launching: ${command}`);

    const child = spawn(profile.executablePath, parseArguments(profile.arguments), {
      cwd: profile.workingDirectory || path.dirname(profile.executablePath),
      env: {
        ...process.env,
        ...profile.environment,
        LORRO_WINDOW_MODE: profile.windowMode,
      },
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    child.on("error", (error) => logger.error(`[launch-profile] spawn failed: ${error.message}`));
    child.unref();

    for (const step of profile.externalTools ?? []) {
      await spawnTool(step);
    }

    return { command, pid: child.pid ?? null };
  }
}

export const launchProfileManager = new LaunchProfileManager();
