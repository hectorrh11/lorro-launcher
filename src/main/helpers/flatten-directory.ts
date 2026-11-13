import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

const MAX_LEVELS = 6;

/**
 * Removes redundant single-directory nesting such as Game/Game/Game.exe.
 * It only moves entries when the target names are free, so it can never
 * overwrite existing files.
 */
export const flattenRedundantDirectories = async (
  folderPath: string
): Promise<string> => {
  let currentPath = folderPath;

  for (let level = 0; level < MAX_LEVELS; level++) {
    let entries: Dirent[];

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return folderPath;
    }

    if (entries.length === 0) return folderPath;

    const hasUnsupportedEntry = entries.some(
      (entry) =>
        entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())
    );
    const directories = entries.filter((entry) => entry.isDirectory());

    if (
      hasUnsupportedEntry ||
      entries.length !== 1 ||
      directories.length !== 1
    ) {
      return folderPath;
    }

    const childPath = path.join(currentPath, directories[0].name);
    let childEntries: Dirent[];

    try {
      childEntries = await fs.readdir(childPath, { withFileTypes: true });
    } catch {
      return folderPath;
    }

    if (childEntries.length === 0) {
      await fs.rmdir(childPath).catch(() => undefined);
      continue;
    }

    const temporaryPath = path.join(
      path.dirname(currentPath),
      `.lorro-flatten-${process.pid}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`
    );

    try {
      await fs.rename(childPath, temporaryPath);
    } catch {
      return folderPath;
    }

    const movedEntries: string[] = [];

    try {
      const stagingEntries = await fs.readdir(temporaryPath, {
        withFileTypes: true,
      });

      for (const entry of stagingEntries) {
        await fs.rename(
          path.join(temporaryPath, entry.name),
          path.join(currentPath, entry.name)
        );
        movedEntries.push(entry.name);
      }

      await fs.rmdir(temporaryPath);
    } catch {
      for (const entryName of movedEntries.reverse()) {
        await fs
          .rename(
            path.join(currentPath, entryName),
            path.join(temporaryPath, entryName)
          )
          .catch(() => undefined);
      }

      await fs.rename(temporaryPath, childPath).catch(() => undefined);
      return folderPath;
    }
  }

  return folderPath;
};
