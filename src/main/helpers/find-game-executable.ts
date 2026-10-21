import fs from "node:fs";
import path from "node:path";

import { logger } from "@main/services/logger";
import {
  isRedistributablePath,
  rankExecutableCandidates,
  type ExecutableSearchScope,
  type KnownGameExecutable,
} from "./game-executable-ranking";

const EXECUTABLE_EXTENSIONS = new Set([".exe", ".bat", ".cmd"]);

const collectFiles = async (
  folderPath: string
): Promise<{ relativePath: string; fullPath: string }[]> => {
  const entries = await fs.promises.readdir(folderPath, {
    withFileTypes: true,
    recursive: true,
  });

  const files: { relativePath: string; fullPath: string }[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const parentPath =
      "parentPath" in entry
        ? entry.parentPath
        : ((entry as unknown as { path?: string }).path ?? folderPath);

    const fullPath = path.join(parentPath, entry.name);
    files.push({
      relativePath: path.relative(folderPath, fullPath),
      fullPath,
    });
  }

  return files;
};

const depthOf = (relativePath: string) =>
  relativePath.split(/[\\/]/).filter(Boolean).length;

export const findLikelyGameExecutableInFolder = async (
  folderPath: string
): Promise<string | null> => {
  let files: { relativePath: string; fullPath: string }[];

  try {
    files = await collectFiles(folderPath);
  } catch (err) {
    logger.error(
      `[findLikelyGameExecutableInFolder] Error reading folder ${folderPath}:`,
      err
    );
    return null;
  }

  const candidates = files.filter(({ relativePath }) => {
    const extension = path.extname(relativePath).toLowerCase();
    return (
      EXECUTABLE_EXTENSIONS.has(extension) &&
      !isRedistributablePath(relativePath)
    );
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].fullPath;

  const sized = await Promise.all(
    candidates.map(async (candidate) => {
      const stats = await fs.promises
        .stat(candidate.fullPath)
        .catch(() => null);

      return {
        ...candidate,
        size: stats?.size ?? 0,
      };
    })
  );

  sized.sort(
    (a, b) =>
      depthOf(a.relativePath) - depthOf(b.relativePath) ||
      b.size - a.size ||
      a.relativePath.localeCompare(b.relativePath)
  );

  return sized[0]?.fullPath ?? null;
};

export const findGameExecutableInFolder = async (
  folderPath: string,
  executables: KnownGameExecutable[],
  scope: ExecutableSearchScope = "installation"
): Promise<string | null> => {
  if (executables.length === 0) return null;

  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(folderPath, {
      withFileTypes: true,
      recursive: true,
    });
  } catch (err) {
    logger.error(
      `[findGameExecutableInFolder] Error reading folder ${folderPath}:`,
      err
    );
    return null;
  }

  const relativeFilePaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const parentPath =
      "parentPath" in entry
        ? entry.parentPath
        : ((entry as unknown as { path?: string }).path ?? folderPath);

    relativeFilePaths.push(
      path.relative(folderPath, path.join(parentPath, entry.name))
    );
  }

  const match = rankExecutableCandidates(relativeFilePaths, executables, scope);

  return match ? path.join(folderPath, match) : null;
};
