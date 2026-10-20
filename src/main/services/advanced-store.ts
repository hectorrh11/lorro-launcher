import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export function storePath(name: string) {
  return path.join(app.getPath("userData"), name);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(storePath(name), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(name: string, value: T): Promise<void> {
  const target = storePath(name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tmp, target);
}
