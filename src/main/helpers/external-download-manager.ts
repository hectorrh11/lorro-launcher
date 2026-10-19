import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { clipboard } from "electron";

import { logger } from "@main/services/logger";
import type { ExternalDownloadManagerInfo } from "@types";

interface ExternalDownloadManager {
  name: string;
  path: string;
  mode: "command" | "clipboard";
  buildArgs?: (url: string, dir: string, fileName: string) => string[];
}

const exists = (candidate: string) => {
  try {
    return Boolean(candidate) && existsSync(candidate);
  } catch {
    return false;
  }
};

const idmArgs = (url: string, dir: string, fileName: string) => [
  "/d",
  url,
  "/p",
  dir,
  "/f",
  fileName,
  "/n",
];

const detectWindows = (): ExternalDownloadManager | null => {
  const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env["LOCALAPPDATA"] ?? "";

  const candidates: ExternalDownloadManager[] = [
    {
      name: "Internet Download Manager",
      path: path.join(programFilesX86, "Internet Download Manager", "IDMan.exe"),
      mode: "command",
      buildArgs: idmArgs,
    },
    {
      name: "Internet Download Manager",
      path: path.join(programFiles, "Internet Download Manager", "IDMan.exe"),
      mode: "command",
      buildArgs: idmArgs,
    },
    {
      name: "Neat Download Manager",
      path: path.join(
        programFiles,
        "Neat Download Manager",
        "NeatDownloadManager.exe"
      ),
      mode: "clipboard",
    },
    {
      name: "Neat Download Manager",
      path: path.join(
        programFilesX86,
        "Neat Download Manager",
        "NeatDownloadManager.exe"
      ),
      mode: "clipboard",
    },
    {
      name: "Neat Download Manager",
      path: path.join(
        localAppData,
        "Programs",
        "Neat Download Manager",
        "NeatDownloadManager.exe"
      ),
      mode: "clipboard",
    },
    {
      name: "Free Download Manager",
      path: path.join(programFilesX86, "Free Download Manager", "fdm.exe"),
      mode: "clipboard",
    },
    {
      name: "Free Download Manager",
      path: path.join(programFiles, "Free Download Manager", "fdm.exe"),
      mode: "clipboard",
    },
  ];

  return candidates.find((candidate) => exists(candidate.path)) ?? null;
};

export const detectExternalDownloadManager =
  (): ExternalDownloadManagerInfo => {
    if (process.platform !== "win32") {
      return { available: false, name: null, path: null, mode: "none" };
    }

    const found = detectWindows();

    return found
      ? { available: true, name: found.name, path: found.path, mode: found.mode }
      : { available: false, name: null, path: null, mode: "none" };
  };

export const openInExternalDownloadManager = async (
  url: string,
  destinationDir: string,
  fileName: string
): Promise<ExternalDownloadManagerInfo & { started: boolean }> => {
  const info = detectExternalDownloadManager();

  if (!info.available || !info.path) {
    return { ...info, started: false };
  }

  try {
    const found = detectWindows();

    if (info.mode === "command") {
      const args = found?.buildArgs?.(url, destinationDir, fileName) ?? [url];
      const child = spawn(info.path, args, { detached: true, stdio: "ignore" });
      child.unref();
      return { ...info, started: true };
    }

    clipboard.writeText(url);
    const child = spawn(info.path, [], { detached: true, stdio: "ignore" });
    child.unref();
    return { ...info, started: true };
  } catch (error) {
    logger.warn("Could not launch the external download manager", error);
    return { ...info, started: false };
  }
};
