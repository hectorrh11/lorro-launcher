import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const servicePath = path.join(
  projectRoot,
  "src/main/services/game-zip-import.ts"
);
const bundlePath = path.join(
  projectRoot,
  `.zip-import-test-${process.pid}.cjs`
);

const stubModules = {
  electron: `
    export const app = { isPackaged: true };
  `,
  "./7zip": `
    import { execFile, spawn } from "node:child_process";
    import path from "node:path";

    const binaryPath = () => {
      const name = process.platform === "win32" ? "7z.exe" : process.platform === "darwin" ? "7zz" : "7zzs";
      return path.join(process.resourcesPath, name);
    };

    const listEntries = (filePath, signal) =>
      new Promise((resolve, reject) => {
        execFile(
          binaryPath(),
          ["l", "-slt", "-ba", "-sccUTF-8", "-p-", "--", filePath],
          { maxBuffer: 8 * 1024 * 1024, timeout: 30000, signal },
          (error, stdout) => {
            if (error) return reject(error);
            const entries = [];
            let current = null;
            for (const line of stdout.split(/\\r?\\n/)) {
              if (!line.trim()) {
                if (current?.name) entries.push(current);
                current = null;
                continue;
              }
              const match = /^(Path|Size|Attributes|Encrypted) = (.*)$/.exec(line);
              if (!match) continue;
              if (!current) current = { name: "", size: 0 };
              if (match[1] === "Path") current.name = match[2];
              if (match[1] === "Size") current.size = Number(match[2]) || 0;
              if (match[1] === "Attributes") current.attributes = match[2];
              if (match[1] === "Encrypted") current.encrypted = match[2] === "+";
            }
            if (current?.name) entries.push(current);
            resolve(
              entries
                .filter((entry) => !entry.attributes?.includes("D"))
                .map(({ name, size, encrypted }) => ({ name, size, encrypted }))
            );
          }
        );
      });

    const extractFile = ({ filePath, outputPath, cwd, passwords = [], signal }, onProgress) =>
      new Promise((resolve, reject) => {
        const destination = outputPath ?? cwd ?? process.cwd();
        const attempt = (index) => {
          const password = passwords[index] ?? "";
          const args = ["x", "-y", \`-p\${password}\`, "--", filePath];
          const child = spawn(binaryPath(), args, { cwd: destination, windowsHide: true });
          let settled = false;
          const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
          };
          const onAbort = () => {
            child.kill();
            fail(signal?.reason instanceof Error ? signal.reason : new DOMException("aborted", "AbortError"));
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          child.on("error", fail);
          child.on("close", (code) => {
            signal?.removeEventListener("abort", onAbort);
            if (settled) return;
            if (code === 0) {
              settled = true;
              resolve({ success: true, extractedFiles: [] });
              return;
            }
            if (index < passwords.length - 1) return attempt(index + 1);
            fail(new Error("7-Zip extraction failed"));
          });
          onProgress?.({ percent: 50, fileCount: 0, file: "" });
        };
        const delay = globalThis.__zipImportDelayMs ?? 0;
        const start = () => {
          if (signal?.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new DOMException("aborted", "AbortError"));
            return;
          }
          attempt(0);
        };
        if (delay > 0) {
          const timer = setTimeout(start, delay);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new DOMException("aborted", "AbortError")
              );
            },
            { once: true }
          );
        } else {
          start();
        }
      });

    export class SevenZip {
      static listEntries(filePath, signal) {
        return listEntries(filePath, signal);
      }
      static extractFile(options, onProgress) {
        return extractFile(options, onProgress);
      }
    }
  `,
  "@shared": `
    export const MINIMUM_FREE_DISK_SPACE_BYTES = 1024;
    export const Downloader = { Custom: 16 };
  `,
  "@main/level": `
    const state = () => globalThis.__zipImportState;
    export const levelKeys = {
      game: (shop, objectId) => \`\${shop}:\${objectId}\`,
    };
    export const gamesSublevel = {
      get: async (key) => state().games.get(key),
      put: async (key, value) => state().games.set(key, value),
    };
    export const downloadsSublevel = {
      get: async (key) => state().downloads.get(key),
      put: async (key, value) => state().downloads.set(key, value),
    };
  `,
  "@main/events/helpers/get-downloads-path": `
    export const getDownloadsPath = async () => globalThis.__zipImportState.downloadsPath;
  `,
  "./disk-usage": `
    export const getDiskUsage = async () => ({
      free: Number.MAX_SAFE_INTEGER,
      total: Number.MAX_SAFE_INTEGER,
    });
  `,
  "./logger": `
    export const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  `,
  "./window-manager": `
    export class WindowManager {
      static sendToAppWindows() {}
      static sendDownloadsUpdated() {}
    }
  `,
  "./game-files-manager": `
    import path from "node:path";
    import fs from "node:fs";

    const findExecutable = (folderPath) => {
      const pending = [folderPath];
      while (pending.length > 0) {
        const current = pending.pop();
        let entries;
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          const entryPath = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(entryPath);
          else if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) return entryPath;
        }
      }
      return null;
    };

    export class GameFilesManager {
      constructor(shop, objectId) {
        this.key = \`\${shop}:\${objectId}\`;
      }
      async extractFilesInDirectory() {
        return true;
      }
      async setExtractionComplete() {
        const state = globalThis.__zipImportState;
        const download = state.downloads.get(this.key);
        const game = state.games.get(this.key);
        if (!download || !game || !download.folderName) return;
        const executablePath = findExecutable(path.join(download.downloadPath, download.folderName));
        if (executablePath) state.games.set(this.key, { ...game, executablePath });
        state.downloads.set(this.key, { ...download, extracting: false });
      }
    }
  `,
};

const stubPlugin = {
  name: "zip-import-test-stubs",
  setup(buildApi) {
    buildApi.onResolve({ filter: /.*/ }, (args) => {
      if (stubModules[args.path]) {
        return { path: args.path, namespace: "zip-test-stub" };
      }
      if (
        [
          "./7zip",
          "./disk-usage",
          "./logger",
          "./window-manager",
          "./game-files-manager",
        ].includes(args.path) &&
        args.importer.includes(`${path.sep}main${path.sep}services${path.sep}`)
      ) {
        return { path: args.path, namespace: "zip-test-stub" };
      }
      if (args.path === "@main/helpers/flatten-directory") {
        return {
          path: path.join(projectRoot, "src/main/helpers/flatten-directory.ts"),
        };
      }
      if (args.path === "@types") {
        return { path: args.path, namespace: "zip-test-stub" };
      }
      return undefined;
    });
    buildApi.onLoad({ filter: /.*/, namespace: "zip-test-stub" }, (args) => ({
      contents: stubModules[args.path] ?? "export {};",
      loader: "js",
    }));
  },
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (data) => {
  let value = 0xffffffff;
  for (const byte of data)
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const createZip = (destinationPath, entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data, "utf8");
    const crc = crc32(data);
    const dosDate = ((2024 - 1980) << 9) | (1 << 5) | 1;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, data);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return fs.writeFile(
    destinationPath,
    Buffer.concat([...localParts, centralDirectory, end])
  );
};

const tempRoots = [];
let manager;

const state = () => globalThis.__zipImportState;

const createRoot = async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "lorro-zip-import-test-")
  );
  tempRoots.push(root);
  const downloadsPath = path.join(root, "downloads");
  await fs.mkdir(downloadsPath, { recursive: true });
  globalThis.__zipImportState = {
    games: new Map([
      [
        "steam:1",
        {
          shop: "steam",
          objectId: "1",
          title: "Test Game",
          isDeleted: false,
          executablePath: null,
        },
      ],
    ]),
    downloads: new Map(),
    downloadsPath,
  };
  return { root, downloadsPath };
};

const createSourceZip = async (
  root,
  entries = [{ name: "Game/Game/Game.exe", data: "fake exe" }]
) => {
  const sourcePath = path.join(root, "source", "Game.zip");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await createZip(sourcePath, entries);
  return sourcePath;
};

const runImport = async (
  mode,
  extractAutomatically,
  deleteZipAfterExtraction
) => {
  const { root, downloadsPath } = await createRoot();
  const sourcePath = await createSourceZip(root);
  const result = await manager.import({
    operationId: randomUUID(),
    shop: "steam",
    objectId: "1",
    zipPath: sourcePath,
    mode,
    extractAutomatically,
    deleteZipAfterExtraction,
  });

  return {
    result,
    root,
    downloadsPath,
    sourcePath,
    destinationZipPath: path.join(downloadsPath, "Game.zip"),
    extractionPath: path.join(downloadsPath, "Game"),
  };
};

const cleanupRoot = async (root) => {
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
};

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL ${name}: ${error?.message ?? error}`);
  }
};

await build({
  entryPoints: [servicePath],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  absWorkingDir: projectRoot,
  plugins: [stubPlugin],
  logLevel: "silent",
});

process.resourcesPath = path.join(projectRoot, "binaries");
manager = require(bundlePath).gameZipImportManager;

const combinations = [
  ["Copy + extract + delete", "copy", true, true],
  ["Copy + extract + keep", "copy", true, false],
  ["Move + extract + delete", "move", true, true],
  ["Move + extract + keep", "move", true, false],
  ["Copy + no extract", "copy", false, false],
  ["Move + no extract", "move", false, false],
];

for (const [name, mode, extract, deleteZip] of combinations) {
  await test(name, async () => {
    const {
      result,
      downloadsPath,
      sourcePath,
      destinationZipPath,
      extractionPath,
    } = await runImport(mode, extract, deleteZip);

    assert.equal(result.ok, true);
    assert.equal(
      existsSync(sourcePath),
      mode === "copy",
      "original ZIP handling"
    );
    assert.equal(
      existsSync(destinationZipPath),
      !deleteZip,
      "destination ZIP handling"
    );

    if (extract) {
      assert.equal(
        existsSync(path.join(extractionPath, "Game.exe")),
        true,
        "Game/Game nesting flattened"
      );
      assert.equal(result.installed, true);
      assert.equal(
        state().games.get("steam:1")?.executablePath,
        path.join(extractionPath, "Game.exe")
      );
    } else {
      assert.equal(existsSync(extractionPath), false);
      assert.equal(result.installed, false);
      assert.equal(state().games.get("steam:1")?.executablePath, null);
    }

    assert.equal(state().games.size, 1, "no new game entry");
    assert.equal(
      state().downloads.get("steam:1")?.folderName,
      extract ? "Game" : "Game.zip"
    );
    assert.equal(existsSync(downloadsPath), true);
  });
}

await test("cancels an extraction without leaving installed state", async () => {
  const { root, downloadsPath } = await createRoot();
  const sourcePath = await createSourceZip(root);
  globalThis.__zipImportDelayMs = 1500;

  const operationId = randomUUID();
  const importPromise = manager.import({
    operationId,
    shop: "steam",
    objectId: "1",
    zipPath: sourcePath,
    mode: "copy",
    extractAutomatically: true,
    deleteZipAfterExtraction: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(manager.cancel(operationId), true);

  const result = await importPromise;
  globalThis.__zipImportDelayMs = 0;

  assert.equal(result.ok, false);
  assert.equal(result.error, "cancelled");
  assert.equal(existsSync(sourcePath), true, "copy keeps the original");
  assert.equal(
    existsSync(path.join(downloadsPath, "Game.zip")),
    true,
    "ZIP is kept after cancellation"
  );
  assert.equal(
    existsSync(path.join(downloadsPath, "Game")),
    false,
    "partial extraction folder is removed"
  );
  assert.equal(state().games.get("steam:1")?.executablePath, null);
  assert.equal(state().downloads.get("steam:1")?.extracting, false);
});

await test("rejects corrupt ZIPs", async () => {
  const { root, downloadsPath } = await createRoot();
  const sourcePath = path.join(root, "source", "Broken.zip");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "not a zip");

  const inspection = await manager.inspect("steam", "1", sourcePath);
  assert.equal(inspection.ok, false);
  assert.equal(inspection.error, "invalid-zip");

  const result = await manager.import({
    operationId: randomUUID(),
    shop: "steam",
    objectId: "1",
    zipPath: sourcePath,
    mode: "copy",
    extractAutomatically: true,
    deleteZipAfterExtraction: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid-zip");
  assert.equal(existsSync(sourcePath), true);
  assert.equal(existsSync(downloadsPath), true);
  assert.equal(state().downloads.has("steam:1"), false);
  assert.equal(state().games.get("steam:1")?.executablePath, null);
});

await test("blocks ZIP Slip entries", async () => {
  const { root, downloadsPath } = await createRoot();
  const sourcePath = path.join(root, "source", "Slip.zip");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await createZip(sourcePath, [
    { name: "../evil.txt", data: "evil" },
    { name: "Game.exe", data: "fake exe" },
  ]);

  const inspection = await manager.inspect("steam", "1", sourcePath);
  assert.equal(inspection.ok, false);
  assert.equal(inspection.error, "unsafe-archive");

  const result = await manager.import({
    operationId: randomUUID(),
    shop: "steam",
    objectId: "1",
    zipPath: sourcePath,
    mode: "copy",
    extractAutomatically: true,
    deleteZipAfterExtraction: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "unsafe-archive");
  assert.equal(existsSync(path.join(root, "evil.txt")), false);
  assert.equal(existsSync(path.join(downloadsPath, "evil.txt")), false);
  assert.equal(existsSync(sourcePath), true);
  assert.equal(state().downloads.has("steam:1"), false);
  assert.equal(state().games.get("steam:1")?.executablePath, null);
});

await test("requires overwrite confirmation", async () => {
  const { root, downloadsPath } = await createRoot();
  const sourcePath = await createSourceZip(root);
  const existingZip = path.join(downloadsPath, "Game.zip");
  await fs.writeFile(existingZip, "old zip");

  const inspection = await manager.inspect("steam", "1", sourcePath);
  assert.equal(inspection.ok, true);
  assert.deepEqual(inspection.inspection?.conflicts, ["zip"]);

  const result = await manager.import({
    operationId: randomUUID(),
    shop: "steam",
    objectId: "1",
    zipPath: sourcePath,
    mode: "copy",
    extractAutomatically: true,
    deleteZipAfterExtraction: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "destination-conflict");
  assert.equal(await fs.readFile(existingZip, "utf8"), "old zip");
  assert.equal(existsSync(sourcePath), true);
  assert.equal(state().games.get("steam:1")?.executablePath, null);
});

await fs.rm(bundlePath, { force: true }).catch(() => undefined);
for (const root of tempRoots) await cleanupRoot(root);

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`
);
if (failed.length > 0) process.exitCode = 1;
