import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { shell } from "electron";
import axios from "axios";
import * as tar from "tar";
import type {
  ProtonInstallProgress,
  ProtonInstallResult,
  ProtonOfficialChannel,
  ProtonOfficialInstallResult,
  ProtonRelease,
  ProtonVersion,
} from "@types";
import { SystemPath } from "./system-path";
import { logger } from "./logger";
import { UmuUpdater } from "./umu-updater";

const PROTON_RELEASES_URL =
  "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases?per_page=8";
const PROTON_RELEASES_TIMEOUT_MS = 20_000;
const PROTON_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const PROTON_CHECKSUM_TIMEOUT_MS = 20_000;
const PROTON_RELEASES_CACHE_MS = 5 * 60 * 1000;
const PROTON_MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const PROTON_OFFICIAL_APP_IDS: Record<ProtonOfficialChannel, string> = {
  experimental: "1493710",
  latest: "4628710",
};

interface ProtonReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface ProtonGithubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: ProtonReleaseAsset[];
}

interface AvailableProtonRelease {
  tag: string;
  name: string;
  version: string;
  size: number;
  publishedAt: string;
  downloadUrl: string;
  checksumUrl: string | null;
}

const isValidProtonDirectory = (directoryPath: string) =>
  fs.existsSync(path.join(directoryPath, "proton")) &&
  fs.existsSync(path.join(directoryPath, "toolmanifest.vdf"));

const getManagedProtonDirectory = () =>
  path.join(SystemPath.getPath("userData"), "proton");

const isSafeTag = (tag: string) => /^[A-Za-z0-9._-]+$/.test(tag);

const parseChecksum = (value: string) => {
  const checksum = value.trim().split(/\s+/)[0]?.toLowerCase();
  return checksum && /^[a-f0-9]{128}$/.test(checksum) ? checksum : null;
};

const hashFile = async (filePath: string, algorithm: "sha512") => {
  const hash = createHash(algorithm);
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
};

const getReleaseName = (tag: string) =>
  tag.startsWith("GE-Proton") ? tag : `GE-Proton ${tag}`;

export class ProtonManager {
  private static releasesCache: {
    fetchedAt: number;
    releases: AvailableProtonRelease[];
  } | null = null;
  private static installPromise: Promise<ProtonInstallResult> | null = null;
  private static installingTag: string | null = null;

  public static getManagedDirectory() {
    return getManagedProtonDirectory();
  }

  public static getInstalledVersions(): ProtonVersion[] {
    if (process.platform !== "linux") return [];

    const root = getManagedProtonDirectory();
    if (!fs.existsSync(root)) return [];

    const entries = fs.readdirSync(root, { withFileTypes: true });
    const versions: ProtonVersion[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (!isSafeTag(entry.name)) continue;

      const candidatePath = path.join(root, entry.name);
      if (!isValidProtonDirectory(candidatePath)) continue;

      versions.push({
        name: entry.name,
        path: candidatePath,
        source: "managed",
      });
    }

    return versions.sort((a, b) => b.name.localeCompare(a.name));
  }

  public static async listAvailable(): Promise<ProtonRelease[]> {
    if (process.platform !== "linux") return [];

    const releases = await this.getReleases();
    const installed = new Set(
      this.getInstalledVersions().map((version) => version.name)
    );

    return releases.map((release) => {
      const isInstalled = installed.has(release.tag);

      return {
        ...release,
        installed: isInstalled,
        managed: isInstalled,
      };
    });
  }

  public static async install(
    tag: string,
    onProgress?: (progress: ProtonInstallProgress) => void
  ): Promise<ProtonInstallResult> {
    if (process.platform !== "linux") {
      return { ok: false, message: "Proton is only available on Linux." };
    }

    if (!isSafeTag(tag)) {
      return { ok: false, message: "Invalid Proton version." };
    }

    if (this.installPromise) {
      return {
        ok: false,
        message: this.installingTag
          ? `Another Proton version is already being installed (${this.installingTag}).`
          : "Another Proton version is already being installed.",
      };
    }

    this.installingTag = tag;
    this.installPromise = this.installRelease(tag, onProgress).finally(() => {
      this.installPromise = null;
      this.installingTag = null;
    });

    return this.installPromise;
  }

  public static async uninstall(tag: string): Promise<ProtonInstallResult> {
    if (process.platform !== "linux") {
      return { ok: false, message: "Proton is only available on Linux." };
    }

    if (!isSafeTag(tag) || tag.includes("..")) {
      return { ok: false, message: "Invalid Proton version." };
    }

    const targetPath = path.join(getManagedProtonDirectory(), tag);
    if (!fs.existsSync(targetPath)) {
      return { ok: false, message: "Proton version is not installed." };
    }

    try {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      logger.info("Managed Proton version removed", { tag, targetPath });
      return { ok: true, message: "Proton version removed.", path: targetPath };
    } catch (error) {
      logger.error("Failed to remove managed Proton version", {
        tag,
        targetPath,
        error,
      });
      return { ok: false, message: "Could not remove the Proton version." };
    }
  }

  public static async installOfficial(
    channel: ProtonOfficialChannel
  ): Promise<ProtonOfficialInstallResult> {
    if (process.platform !== "linux") {
      return { ok: false, message: "Proton is only available on Linux." };
    }

    const appId = PROTON_OFFICIAL_APP_IDS[channel];
    if (!appId) {
      return { ok: false, message: "Unknown Proton channel." };
    }

    try {
      await shell.openExternal(`steam://install/${appId}`);
      return {
        ok: true,
        message: "Steam has been opened to install Proton.",
      };
    } catch (error) {
      logger.error("Failed to open Steam Proton installation", {
        channel,
        appId,
        error,
      });
      return { ok: false, message: "Could not open Steam." };
    }
  }

  private static async getReleases(): Promise<AvailableProtonRelease[]> {
    const now = Date.now();
    if (
      this.releasesCache &&
      now - this.releasesCache.fetchedAt < PROTON_RELEASES_CACHE_MS
    ) {
      return this.releasesCache.releases;
    }

    const response = await axios.get<ProtonGithubRelease[]>(
      PROTON_RELEASES_URL,
      {
        timeout: PROTON_RELEASES_TIMEOUT_MS,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Lorro-Launcher",
        },
      }
    );

    const releases = response.data
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => {
        const tag = release.tag_name;
        const archive = release.assets.find(
          (asset) => asset.name === `${tag}-x86_64.tar.gz`
        );
        const checksum = release.assets.find(
          (asset) => asset.name === `${tag}-x86_64.sha512sum`
        );

        if (!archive || !isSafeTag(tag)) return null;

        return {
          tag,
          name: release.name || getReleaseName(tag),
          version: tag,
          size: archive.size,
          publishedAt: release.published_at,
          downloadUrl: archive.browser_download_url,
          checksumUrl: checksum?.browser_download_url ?? null,
        } satisfies AvailableProtonRelease;
      })
      .filter((release): release is AvailableProtonRelease => Boolean(release));

    this.releasesCache = { fetchedAt: now, releases };
    return releases;
  }

  private static async installRelease(
    tag: string,
    onProgress?: (progress: ProtonInstallProgress) => void
  ): Promise<ProtonInstallResult> {
    const root = getManagedProtonDirectory();
    const targetPath = path.join(root, tag);

    if (fs.existsSync(targetPath)) {
      return {
        ok: true,
        message: "Proton version is already installed.",
        path: targetPath,
      };
    }

    const release = (await this.getReleases()).find(
      (candidate) => candidate.tag === tag
    );

    if (!release) {
      return { ok: false, message: "Proton version is not available." };
    }

    if (release.size > PROTON_MAX_ARCHIVE_BYTES) {
      return { ok: false, message: "The Proton archive is too large." };
    }

    const workingDirectory = path.join(root, `.download-${randomUUID()}`);
    const archivePath = path.join(workingDirectory, "proton.tar.gz");
    const extractionDirectory = path.join(workingDirectory, "extract");

    await fs.promises.mkdir(extractionDirectory, { recursive: true });

    try {
      await this.downloadRelease(release, archivePath, onProgress);

      if (release.checksumUrl) {
        onProgress?.({
          tag,
          phase: "verifying",
          receivedBytes: release.size,
          totalBytes: release.size,
        });
        await this.verifyChecksum(release, archivePath);
      }

      onProgress?.({
        tag,
        phase: "extracting",
        receivedBytes: release.size,
        totalBytes: release.size,
      });
      await tar.x({ file: archivePath, cwd: extractionDirectory });

      const extractedDirectory = this.findExtractedProton(extractionDirectory);
      if (!extractedDirectory) {
        throw new Error(
          "The Proton archive does not contain a valid Proton build."
        );
      }

      onProgress?.({
        tag,
        phase: "installing",
        receivedBytes: release.size,
        totalBytes: release.size,
      });

      await fs.promises.mkdir(root, { recursive: true });
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      await fs.promises.rename(extractedDirectory, targetPath);
      await fs.promises.chmod(path.join(targetPath, "proton"), 0o755);

      logger.info("Managed Proton version installed", {
        tag,
        targetPath,
        size: release.size,
      });

      void UmuUpdater.checkForUpdates();

      return {
        ok: true,
        message: "Proton version installed.",
        path: targetPath,
      };
    } catch (error) {
      logger.error("Failed to install managed Proton version", {
        tag,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not install the Proton version.",
      };
    } finally {
      await fs.promises
        .rm(workingDirectory, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private static async downloadRelease(
    release: AvailableProtonRelease,
    archivePath: string,
    onProgress?: (progress: ProtonInstallProgress) => void
  ) {
    const response = await axios.get<NodeJS.ReadableStream>(
      release.downloadUrl,
      {
        responseType: "stream",
        timeout: PROTON_DOWNLOAD_TIMEOUT_MS,
        maxContentLength: PROTON_MAX_ARCHIVE_BYTES,
        maxBodyLength: Infinity,
        headers: { "User-Agent": "Lorro-Launcher" },
      }
    );

    const headerSize = Number(response.headers["content-length"] ?? 0);
    const totalBytes = headerSize > 0 ? headerSize : release.size;
    let receivedBytes = 0;

    onProgress?.({
      tag: release.tag,
      phase: "downloading",
      receivedBytes,
      totalBytes,
    });

    const progressStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedBytes += chunk.length;
        onProgress?.({
          tag: release.tag,
          phase: "downloading",
          receivedBytes,
          totalBytes,
        });
        callback(null, chunk);
      },
    });

    await pipeline(
      response.data,
      progressStream,
      fs.createWriteStream(archivePath)
    );

    if (receivedBytes === 0) {
      throw new Error("The Proton download was empty.");
    }

    if (receivedBytes > PROTON_MAX_ARCHIVE_BYTES) {
      throw new Error("The Proton download is too large.");
    }
  }

  private static async verifyChecksum(
    release: AvailableProtonRelease,
    archivePath: string
  ) {
    if (!release.checksumUrl) return;

    const response = await axios.get<string>(release.checksumUrl, {
      timeout: PROTON_CHECKSUM_TIMEOUT_MS,
      responseType: "text",
      headers: { "User-Agent": "Lorro-Launcher" },
    });
    const expected = parseChecksum(response.data);
    if (!expected) {
      throw new Error("The Proton checksum file is invalid.");
    }

    const actual = await hashFile(archivePath, "sha512");
    if (actual !== expected) {
      throw new Error("The Proton archive checksum does not match.");
    }
  }

  private static findExtractedProton(extractionDirectory: string) {
    const entries = fs.readdirSync(extractionDirectory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(extractionDirectory, entry.name);
      if (isValidProtonDirectory(candidate)) return candidate;
    }

    if (isValidProtonDirectory(extractionDirectory)) {
      return extractionDirectory;
    }

    return null;
  }
}
