import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";

import { app } from "electron";

import { defaultDownloadsPath } from "@main/constants";
import { gamesShopAssetsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import type {
  CustomDownload,
  GameShop,
  StartCustomDownloadPayload,
} from "@types";

import { WindowManager } from "./window-manager";

const STATE_VERSION = 2;
const PROGRESS_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 15_000;
const STALL_TIMEOUT_MS = 20_000;
const STALL_CHECK_INTERVAL_MS = 5_000;
const USER_AGENT = "Lorro-Launcher";
const DEFAULT_CONNECTIONS = 8;
const MAX_CONNECTIONS = 32;
const MAX_TRANSFER_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1500;
const MIN_SEGMENT_BYTES = 1024 * 1024;

const clampConnections = (value?: number) =>
  Math.max(
    1,
    Math.min(Math.round(value ?? DEFAULT_CONNECTIONS), MAX_CONNECTIONS)
  );

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRetryableTransferError = (error: unknown) => {
  const message = toErrorMessage(error);

  if (message.includes("returned a web page")) return false;

  const httpStatus = /HTTP (\d{3})/.exec(message);

  if (httpStatus) {
    const status = Number(httpStatus[1]);
    return status === 408 || status === 429 || status >= 500;
  }

  return true;
};

const sanitizeFileName = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 180);

export const deriveFileName = (url: string) => {
  try {
    const parsed = new URL(url);
    const base = decodeURIComponent(path.basename(parsed.pathname));
    const safe = sanitizeFileName(base);

    if (safe) return safe;
  } catch {
    // Fall through to a generated name.
  }

  return `lorro-download-${Date.now()}`;
};

export class CustomDownloadManager {
  private downloads: CustomDownload[] = [];
  private activeAbort: AbortController | null = null;
  private activeId: string | null = null;
  private isPumping = false;
  private progressTimer: NodeJS.Timeout | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadState();
  }

  initialize() {
    return this.ready;
  }

  list(): CustomDownload[] {
    return this.downloads.map((download) => ({ ...download }));
  }

  private async probe(url: string): Promise<{
    totalBytes: number;
    fileName: string | null;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const validate = (response: Response, rejectEmpty: boolean) => {
      if (!response.ok && response.status !== 206) {
        throw new Error(
          `The server responded with HTTP ${response.status}. Check that the link is public and still available.`
        );
      }

      const contentType = (response.headers.get("content-type") ?? "")
        .toLowerCase()
        .split(";")[0]
        .trim();

      const contentDisposition =
        response.headers.get("content-disposition") ?? "";
      const dispositionMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(
        contentDisposition
      );
      let fileName: string | null = null;

      if (dispositionMatch?.[1]) {
        try {
          fileName = sanitizeFileName(
            decodeURIComponent(dispositionMatch[1].replace(/"/g, ""))
          );
        } catch {
          fileName = sanitizeFileName(dispositionMatch[1].replace(/"/g, ""));
        }
      }

      const looksLikePage =
        contentType.includes("text/html") &&
        !/\.html?($|\?)/i.test(url) &&
        !(fileName && /\.html?$/i.test(fileName));

      if (looksLikePage) {
        throw new Error(
          "That link is a web page, not a file. Paste a direct download link."
        );
      }

      if (contentType.includes("application/json")) {
        throw new Error(
          "That link returns data, not a downloadable file. Paste a direct download link."
        );
      }

      const contentRange = response.headers.get("content-range") ?? "";
      const totalMatch = /\/(\d+)$/.exec(contentRange);
      const contentLength = Number(response.headers.get("content-length") ?? 0);

      let totalBytes = 0;

      if (totalMatch) {
        totalBytes = Number(totalMatch[1]);
      } else if (Number.isFinite(contentLength) && contentLength > 0) {
        totalBytes = contentLength;
      }

      if (totalBytes === 0 && rejectEmpty) {
        throw new Error(
          "The link returned an empty file (0 bytes). Check the link and try again."
        );
      }

      return { totalBytes, fileName };
    };

    try {
      let headResponse: Response | null = null;

      try {
        headResponse = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: { "User-Agent": USER_AGENT },
          signal: controller.signal,
        });
      } catch {
        headResponse = null;
      }

      if (headResponse) {
        const headLength = Number(
          headResponse.headers.get("content-length") ?? 0
        );

        headResponse.body?.cancel().catch(() => undefined);

        if (headResponse.ok && headLength > 0) {
          return validate(headResponse, true);
        }
      }

      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Range: "bytes=0-0",
        },
        signal: controller.signal,
      });

      const result = validate(response, true);

      await response.body?.cancel().catch(() => undefined);

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          "The link took too long to respond. Check that it is reachable and try again."
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          "Could not reach that link. Check the URL and your connection."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async start(payload: StartCustomDownloadPayload): Promise<CustomDownload> {
    await this.ready;

    const url = (payload?.url ?? "").trim();

    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Only http and https links are supported.");
    }

    const destinationDir =
      payload.destinationDir?.trim() || defaultDownloadsPath;

    await fs.mkdir(destinationDir, { recursive: true });

    const probe = await this.probe(url);

    const fileName = probe.fileName || deriveFileName(url);
    const title = payload.title?.trim() || fileName;

    const download: CustomDownload = {
      id: randomUUID(),
      url,
      title,
      fileName,
      destinationDir,
      filePath: "",
      totalBytes: probe.totalBytes,
      bytesDownloaded: 0,
      status: "queued",
      speed: 0,
      error: null,
      createdAt: Date.now(),
      completedAt: null,
      addToLibrary: payload.addToLibrary ?? false,
      libraryGameId: null,
      connections: clampConnections(payload.connections),
      segments: null,
    };

    this.downloads.unshift(download);

    this.emitProgress(true);
    await this.persistState();
    void this.processQueue();

    return { ...download };
  }

  async pause(id: string) {
    await this.ready;

    const download = this.downloads.find((item) => item.id === id);
    if (!download) return;

    if (download.status === "active") {
      download.status = "paused";
      download.speed = 0;
      this.activeAbort?.abort();
    } else if (download.status === "queued") {
      download.status = "paused";
    } else {
      return;
    }

    this.emitProgress(true);
    await this.persistState();
  }

  async resume(id: string) {
    await this.ready;

    const download = this.downloads.find((item) => item.id === id);
    if (!download) return;

    if (download.status !== "paused" && download.status !== "error") return;

    download.status = "queued";
    download.error = null;
    download.speed = 0;

    this.emitProgress(true);
    await this.persistState();
    void this.processQueue();
  }

  async cancel(id: string) {
    await this.ready;

    const download = this.downloads.find((item) => item.id === id);
    if (!download) return;

    const wasActive = download.status === "active";

    download.status = "canceled";
    download.speed = 0;
    download.error = null;

    if (wasActive) this.activeAbort?.abort();

    await this.deletePartialFile(download);

    this.emitProgress(true);
    await this.persistState();
  }

  async remove(id: string) {
    await this.ready;

    const download = this.downloads.find((item) => item.id === id);
    if (!download) return;

    if (download.status === "active") {
      download.status = "canceled";
      this.activeAbort?.abort();
    }

    if (download.status !== "complete") {
      await this.deletePartialFile(download);
    }

    this.downloads = this.downloads.filter((item) => item.id !== id);

    this.emitProgress(true);
    await this.persistState();
  }

  async shutdown() {
    const active = this.downloads.find((item) => item.id === this.activeId);

    if (active?.status === "active") {
      active.status = "paused";
      active.speed = 0;
      this.activeAbort?.abort();
    }

    await this.persistState();
  }

  private get statePath() {
    return path.join(app.getPath("userData"), "custom-downloads.json");
  }

  private async loadState() {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as {
        version?: number;
        downloads?: Partial<CustomDownload>[];
      };

      if (!Array.isArray(parsed.downloads)) return;

      this.downloads = parsed.downloads
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: item.id as string,
          url: item.url ?? "",
          title: item.title ?? item.fileName ?? "Download",
          fileName: item.fileName ?? "download",
          destinationDir: item.destinationDir ?? defaultDownloadsPath,
          filePath: item.filePath ?? "",
          totalBytes: item.totalBytes ?? 0,
          bytesDownloaded: item.bytesDownloaded ?? 0,
          status:
            item.status === "active" || item.status === "queued"
              ? "paused"
              : (item.status ?? "paused"),
          speed: 0,
          error: item.error ?? null,
          createdAt: item.createdAt ?? Date.now(),
          completedAt: item.completedAt ?? null,
          addToLibrary: item.addToLibrary ?? false,
          libraryGameId: item.libraryGameId ?? null,
          connections: clampConnections(item.connections),
          segments:
            Array.isArray(item.segments) && item.segments.length > 1
              ? item.segments
                  .filter(
                    (segment) =>
                      segment &&
                      typeof segment.start === "number" &&
                      typeof segment.end === "number"
                  )
                  .map((segment) => ({
                    start: segment.start,
                    end: segment.end,
                    downloaded: segment.downloaded ?? 0,
                  }))
              : null,
        }));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        logger.warn("Could not load custom downloads state", error);
      }
    }
  }

  private persistState() {
    this.persistChain = this.persistChain
      .then(() => this.writeState())
      .catch((error) => {
        logger.warn("Could not persist custom downloads state", error);
      });

    return this.persistChain;
  }

  private async writeState() {
    const temporaryPath = `${this.statePath}.tmp`;

    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(
      temporaryPath,
      JSON.stringify(
        { version: STATE_VERSION, downloads: this.downloads },
        null,
        2
      ),
      "utf8"
    );
    await fs.rename(temporaryPath, this.statePath);
  }

  private emitProgress(force = false) {
    const send = () => {
      this.progressTimer = null;
      WindowManager.sendToAppWindows(
        "on-custom-download-progress",
        this.list()
      );
    };

    if (force) {
      if (this.progressTimer) clearTimeout(this.progressTimer);
      this.progressTimer = null;
      send();
      return;
    }

    if (this.progressTimer) return;

    this.progressTimer = setTimeout(send, PROGRESS_INTERVAL_MS);
    this.progressTimer.unref?.();
  }

  private async deletePartialFile(download: CustomDownload) {
    if (!download.filePath) return;

    try {
      await fs.unlink(download.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        logger.warn("Could not delete custom download file", error);
      }
    }
  }

  private async uniqueFilePath(
    destinationDir: string,
    fileName: string,
    currentId: string
  ) {
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);

    let attempt = 0;

    while (true) {
      const suffix = attempt === 0 ? "" : ` (${attempt})`;
      const candidate = path.join(
        destinationDir,
        `${baseName}${suffix}${extension}`
      );

      const usedByAnotherDownload = this.downloads.some(
        (item) => item.id !== currentId && item.filePath === candidate
      );

      if (usedByAnotherDownload) {
        attempt += 1;
        continue;
      }

      try {
        await fs.access(candidate);
        attempt += 1;
      } catch {
        return candidate;
      }
    }
  }

  private async processQueue() {
    if (this.isPumping) return;

    this.isPumping = true;

    try {
      while (true) {
        const next = this.downloads.find((item) => item.status === "queued");
        if (!next) break;

        await this.download(next);
      }
    } finally {
      this.isPumping = false;
    }
  }

  private async download(download: CustomDownload) {
    this.activeId = download.id;
    this.activeAbort = null;

    download.status = "active";
    download.error = null;
    download.speed = 0;

    this.emitProgress(true);
    await this.persistState();

    let forceSingle = false;

    try {
      await fs.mkdir(download.destinationDir, { recursive: true });

      if (!download.filePath) {
        download.filePath = await this.uniqueFilePath(
          download.destinationDir,
          download.fileName,
          download.id
        );
      }

      for (let attempt = 1; ; attempt += 1) {
        const abortController = new AbortController();
        this.activeAbort = abortController;

        try {
          if (
            !forceSingle &&
            download.segments &&
            download.segments.length > 1
          ) {
            await this.downloadSegmented(download, abortController);
          } else if (
            !forceSingle &&
            download.bytesDownloaded === 0 &&
            download.totalBytes >= MIN_SEGMENT_BYTES &&
            clampConnections(download.connections) > 1 &&
            (await this.supportsRanges(download.url, abortController.signal))
          ) {
            await this.downloadSegmented(download, abortController);
          } else {
            await this.downloadSingle(download, abortController);
          }

          if (download.status !== "active") return;

          if (download.bytesDownloaded === 0) {
            throw new Error(
              "The link did not return any data. Check the link and try again."
            );
          }

          if (
            download.totalBytes > 0 &&
            download.bytesDownloaded < download.totalBytes
          ) {
            throw new Error(
              "The connection closed before the download finished. Resume it to continue."
            );
          }

          break;
        } catch (error) {
          if (download.status !== "active") return;

          const reason = abortController.signal.reason;
          const normalizedError =
            error instanceof Error &&
            error.name === "AbortError" &&
            reason instanceof Error
              ? reason
              : error;
          const message = toErrorMessage(normalizedError);

          if (message.includes("stopped supporting parallel downloads")) {
            forceSingle = true;
            download.segments = null;
            download.bytesDownloaded = 0;
          }

          if (
            attempt >= MAX_TRANSFER_ATTEMPTS ||
            !isRetryableTransferError(normalizedError)
          ) {
            throw normalizedError;
          }

          download.speed = 0;
          logger.warn(
            `Custom download interrupted, retrying (${attempt}/${MAX_TRANSFER_ATTEMPTS})`,
            normalizedError
          );
          this.emitProgress();
          await this.persistState();
          await delay(RETRY_DELAY_MS * attempt);

          if (download.status !== "active") return;
        }
      }

      if (download.totalBytes === 0) {
        download.totalBytes = download.bytesDownloaded;
      }

      download.status = "complete";
      download.completedAt = Date.now();
      download.speed = 0;
      download.segments = null;

      await this.finalize(download);
    } catch (error) {
      if (download.status !== "active") {
        return;
      }

      download.speed = 0;
      download.status = "error";
      download.error = toErrorMessage(error);
      logger.warn("Custom download failed", error);

      this.emitProgress(true);
      await this.persistState();
    } finally {
      if (this.activeId === download.id) {
        this.activeId = null;
        this.activeAbort = null;
      }
    }
  }

  private async supportsRanges(url: string, signal: AbortSignal) {
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0" },
        signal,
      });

      await response.body?.cancel().catch(() => undefined);

      return response.status === 206;
    } catch {
      return false;
    }
  }

  private async writeAt(
    fileHandle: Awaited<ReturnType<typeof fs.open>>,
    buffer: Uint8Array,
    position: number
  ) {
    let written = 0;

    while (written < buffer.byteLength) {
      const { bytesWritten } = await fileHandle.write(
        buffer,
        written,
        buffer.byteLength - written,
        position + written
      );

      if (bytesWritten <= 0) {
        throw new Error("Could not write to the destination file.");
      }

      written += bytesWritten;
    }
  }

  private async downloadSegmented(
    download: CustomDownload,
    abortController: AbortController
  ) {
    if (!download.segments || download.segments.length <= 1) {
      const totalBytes = download.totalBytes;
      const connectionCount = clampConnections(download.connections);
      const segmentCount = Math.max(
        1,
        Math.min(connectionCount, Math.ceil(totalBytes / MIN_SEGMENT_BYTES))
      );
      const segmentSize = Math.ceil(totalBytes / segmentCount);

      download.segments = [];

      for (let index = 0; index < segmentCount; index += 1) {
        const start = index * segmentSize;
        const end = Math.min(totalBytes - 1, start + segmentSize - 1);

        if (start > end) break;

        download.segments.push({ start, end, downloaded: 0 });
      }

      download.bytesDownloaded = 0;

      const handle = await fs.open(download.filePath, "w");
      try {
        await handle.truncate(totalBytes);
      } finally {
        await handle.close();
      }
    }

    const segments = download.segments;

    if (segments.length <= 1) {
      return this.downloadSingle(download, abortController);
    }

    const fileHandle = await fs.open(download.filePath, "r+");

    download.bytesDownloaded = segments.reduce(
      (total, segment) => total + segment.downloaded,
      0
    );

    let lastDataAt = Date.now();
    let lastSpeedSampleAt = Date.now();
    let lastSpeedSampleBytes = download.bytesDownloaded;
    let cursor = 0;

    const stallTimer = setInterval(() => {
      if (download.status !== "active") return;
      if (Date.now() - lastDataAt < STALL_TIMEOUT_MS) return;

      abortController.abort(
        new Error(
          "The server stopped sending data. Check the link and try again."
        )
      );
    }, STALL_CHECK_INTERVAL_MS);

    stallTimer.unref?.();

    const worker = async () => {
      while (true) {
        const segment = segments[cursor];

        if (!segment) return;

        cursor += 1;

        const length = segment.end - segment.start + 1;

        if (segment.downloaded >= length) continue;

        const position = segment.start + segment.downloaded;

        const response = await fetch(download.url, {
          headers: {
            "User-Agent": USER_AGENT,
            Range: `bytes=${position}-${segment.end}`,
          },
          redirect: "follow",
          signal: abortController.signal,
        });

        if (response.status !== 206) {
          throw new Error(
            "The server stopped supporting parallel downloads. Try again."
          );
        }

        if (!response.body) {
          throw new Error("The server returned an empty response.");
        }

        const reader = (response.body as unknown as AsyncIterable<Uint8Array>)[
          Symbol.asyncIterator
        ]();

        let offset = position;

        while (true) {
          const { done, value } = await reader.next();
          if (done) break;
          if (!value) continue;

          await this.writeAt(fileHandle, value, offset);

          offset += value.byteLength;
          segment.downloaded += value.byteLength;
          download.bytesDownloaded += value.byteLength;
          lastDataAt = Date.now();

          const now = Date.now();
          const elapsed = now - lastSpeedSampleAt;

          if (elapsed >= PROGRESS_INTERVAL_MS) {
            download.speed = Math.round(
              ((download.bytesDownloaded - lastSpeedSampleBytes) * 1000) /
                elapsed
            );
            lastSpeedSampleAt = now;
            lastSpeedSampleBytes = download.bytesDownloaded;
            this.emitProgress();
          }
        }
      }
    };

    try {
      const workerCount = Math.min(
        clampConnections(download.connections),
        segments.length
      );

      await Promise.all(
        Array.from({ length: workerCount }, () =>
          worker().catch((error) => {
            abortController.abort(error);
            throw error;
          })
        )
      );
    } finally {
      clearInterval(stallTimer);
      await fileHandle.close().catch(() => undefined);
    }
  }

  private async downloadSingle(
    download: CustomDownload,
    abortController: AbortController
  ) {
    download.segments = null;

    const resumeFrom = download.bytesDownloaded;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
    };

    if (resumeFrom > 0) {
      headers.Range = `bytes=${resumeFrom}-`;
    }

    const response = await fetch(download.url, {
      headers,
      redirect: "follow",
      signal: abortController.signal,
    });

    if (response.status === 416 && resumeFrom > 0) {
      download.totalBytes = resumeFrom;
      download.bytesDownloaded = resumeFrom;
      download.status = "complete";
      download.completedAt = Date.now();
      download.speed = 0;

      await this.finalize(download);
      return;
    }

    if (!response.ok) {
      throw new Error(`The server responded with HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      contentType.includes("text/html") &&
      !/\.html?($|\?)/i.test(download.url)
    ) {
      throw new Error(
        "The link returned a web page instead of a file. Use a direct download link."
      );
    }

    const acceptsResume = response.status === 206 || resumeFrom === 0;

    if (!acceptsResume) {
      download.bytesDownloaded = 0;
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentRange = response.headers.get("content-range") ?? "";
    const totalMatch = /\/(\d+)$/.exec(contentRange);

    if (totalMatch) {
      download.totalBytes = Number(totalMatch[1]);
    } else if (Number.isFinite(contentLength) && contentLength > 0) {
      download.totalBytes = download.bytesDownloaded + contentLength;
    } else {
      download.totalBytes = 0;
    }

    if (!response.body) {
      throw new Error("The server returned an empty response.");
    }

    const writer = createWriteStream(download.filePath, {
      flags: download.bytesDownloaded > 0 ? "a" : "w",
    });

    const reader = (response.body as unknown as AsyncIterable<Uint8Array>)[
      Symbol.asyncIterator
    ]();

    let lastSpeedSampleAt = Date.now();
    let lastSpeedSampleBytes = download.bytesDownloaded;
    let lastDataAt = Date.now();

    const stallTimer = setInterval(() => {
      if (download.status !== "active") return;
      if (Date.now() - lastDataAt < STALL_TIMEOUT_MS) return;

      abortController.abort(
        new Error(
          "The server stopped sending data. Check the link and try again."
        )
      );
    }, STALL_CHECK_INTERVAL_MS);

    stallTimer.unref?.();

    try {
      while (true) {
        const { done, value } = await reader.next();
        if (done) break;

        if (!value) continue;

        if (!writer.write(value)) {
          await once(writer, "drain");
        }

        lastDataAt = Date.now();
        download.bytesDownloaded += value.byteLength;

        const now = Date.now();
        const elapsed = now - lastSpeedSampleAt;

        if (elapsed >= PROGRESS_INTERVAL_MS) {
          download.speed = Math.round(
            ((download.bytesDownloaded - lastSpeedSampleBytes) * 1000) / elapsed
          );
          lastSpeedSampleAt = now;
          lastSpeedSampleBytes = download.bytesDownloaded;
          this.emitProgress();
        }
      }
    } finally {
      clearInterval(stallTimer);
      writer.end();
      await once(writer, "finish").catch(() => undefined);
    }
  }

  private async finalize(download: CustomDownload) {
    this.emitProgress(true);
    await this.persistState();

    if (download.addToLibrary && !download.libraryGameId) {
      try {
        download.libraryGameId = await this.addToLibrary(download);
        await this.persistState();
        this.emitProgress(true);
      } catch (error) {
        logger.warn("Could not add custom download to the library", error);
      }
    }
  }

  private async addToLibrary(download: CustomDownload) {
    const objectId = randomUUID();
    const shop: GameShop = "custom";
    const gameKey = levelKeys.game(shop, objectId);

    const isExecutable = /\.(exe|bat|cmd)$/i.test(download.filePath);

    const assets = {
      updatedAt: Date.now(),
      objectId,
      shop,
      title: download.title,
      iconUrl: null,
      libraryHeroImageUrl: "",
      libraryImageUrl: "",
      logoImageUrl: "",
      logoPosition: null,
      coverImageUrl: "",
      downloadSources: [],
    };

    await gamesShopAssetsSublevel.put(gameKey, assets);
    await gamesSublevel.put(gameKey, {
      title: download.title,
      iconUrl: null,
      logoImageUrl: null,
      libraryHeroImageUrl: null,
      objectId,
      shop,
      remoteId: null,
      isDeleted: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      addedToLibraryAt: new Date(),
      ...(isExecutable
        ? {
            executablePath: download.filePath,
            executablePathUpdatedAt: new Date(),
          }
        : {}),
      launchOptions: null,
      favorite: false,
      automaticCloudSync: false,
      hasManuallyUpdatedPlaytime: false,
      installedSizeInBytes: download.totalBytes || undefined,
    });

    WindowManager.sendToAppWindows("on-library-batch-complete");

    return objectId;
  }
}

export const customDownloadManager = new CustomDownloadManager();
