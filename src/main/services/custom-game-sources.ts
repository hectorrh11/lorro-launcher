import { randomUUID } from "node:crypto";

import {
  customGameSourcesSublevel,
  gamesSublevel,
  levelKeys,
} from "@main/level";
import { logger } from "@main/services/logger";
import type {
  CustomDownload,
  CustomGameSource,
  CustomGameSourceMutationResult,
  Game,
  GameShop,
} from "@types";

import { readJson } from "./advanced-store";

const MAX_URL_LENGTH = 2048;
const MAX_LABEL_LENGTH = 120;

const normalizeUrl = (value: string): string | null => {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeLabel = (value?: string | null): string | null => {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  return trimmed.slice(0, MAX_LABEL_LENGTH);
};

const normalizeTitle = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const sortSources = (sources: CustomGameSource[]) =>
  [...sources].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

class CustomGameSourceManager {
  private key(shop: GameShop, objectId: string) {
    return levelKeys.game(shop, objectId);
  }

  async list(shop: GameShop, objectId: string): Promise<CustomGameSource[]> {
    try {
      const sources = await customGameSourcesSublevel.get(
        this.key(shop, objectId)
      );

      return Array.isArray(sources) ? sortSources(sources) : [];
    } catch {
      return [];
    }
  }

  async add(
    shop: GameShop,
    objectId: string,
    url: string,
    label?: string | null
  ): Promise<CustomGameSourceMutationResult> {
    const normalizedUrl = normalizeUrl(url);

    if (!normalizedUrl) return { ok: false, error: "invalid-url" };

    const sources = await this.list(shop, objectId);

    if (sources.some((source) => source.url === normalizedUrl)) {
      return { ok: false, error: "duplicate" };
    }

    const now = new Date().toISOString();
    const source: CustomGameSource = {
      id: randomUUID(),
      url: normalizedUrl,
      label: normalizeLabel(label),
      createdAt: now,
      updatedAt: now,
    };

    await customGameSourcesSublevel.put(this.key(shop, objectId), [
      ...sources,
      source,
    ]);

    return { ok: true, source };
  }

  async update(
    shop: GameShop,
    objectId: string,
    id: string,
    url: string,
    label?: string | null
  ): Promise<CustomGameSourceMutationResult> {
    const normalizedUrl = normalizeUrl(url);

    if (!normalizedUrl) return { ok: false, error: "invalid-url" };

    const sources = await this.list(shop, objectId);
    const existingIndex = sources.findIndex((source) => source.id === id);

    if (existingIndex === -1) return { ok: false, error: "not-found" };

    if (
      sources.some((source) => source.id !== id && source.url === normalizedUrl)
    ) {
      return { ok: false, error: "duplicate" };
    }

    const source: CustomGameSource = {
      ...sources[existingIndex],
      url: normalizedUrl,
      label: normalizeLabel(label),
      updatedAt: new Date().toISOString(),
    };

    sources[existingIndex] = source;
    await customGameSourcesSublevel.put(this.key(shop, objectId), sources);

    return { ok: true, source };
  }

  async remove(shop: GameShop, objectId: string, id: string): Promise<boolean> {
    const sources = await this.list(shop, objectId);
    const nextSources = sources.filter((source) => source.id !== id);

    if (nextSources.length === sources.length) return false;

    await customGameSourcesSublevel.put(this.key(shop, objectId), nextSources);

    return true;
  }

  private async addMigratedSource(
    shop: GameShop,
    objectId: string,
    url: string,
    label: string | null
  ) {
    const sources = await this.list(shop, objectId);

    if (sources.some((source) => source.url === url)) return;

    const now = new Date().toISOString();

    await customGameSourcesSublevel.put(this.key(shop, objectId), [
      ...sources,
      {
        id: randomUUID(),
        url,
        label: normalizeLabel(label),
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  async migrateLegacyCustomGames(): Promise<void> {
    try {
      const state = await readJson<{
        downloads?: Partial<CustomDownload>[];
      }>("custom-downloads.json", {});
      const downloads = Array.isArray(state.downloads) ? state.downloads : [];

      const entries = await gamesSublevel.iterator().all();
      const legacyGames = entries
        .map(([key, game]) => ({ key, game }))
        .filter(({ game }) => game.shop === "custom" && !game.isDeleted);

      if (legacyGames.length === 0) return;

      const catalogGamesByTitle = new Map<string, Game[]>();

      for (const [, game] of entries) {
        if (game.shop === "custom" || game.isDeleted) continue;

        const normalizedTitle = normalizeTitle(game.title);
        if (!normalizedTitle) continue;

        const games = catalogGamesByTitle.get(normalizedTitle) ?? [];
        games.push(game);
        catalogGamesByTitle.set(normalizedTitle, games);
      }

      for (const { key, game: legacyGame } of legacyGames) {
        const normalizedTitle = normalizeTitle(legacyGame.title);
        if (!normalizedTitle) continue;

        const candidates = catalogGamesByTitle.get(normalizedTitle) ?? [];

        if (candidates.length !== 1) continue;

        const target = candidates[0];
        const byLibraryId = downloads.find(
          (download) => download.libraryGameId === legacyGame.objectId
        );
        const byTitle = downloads.filter(
          (download) =>
            !!download.url &&
            normalizeTitle(download.title ?? "") === normalizedTitle
        );
        const download =
          byLibraryId ?? (byTitle.length === 1 ? byTitle[0] : undefined);

        if (!download?.url) continue;

        const url = normalizeUrl(download.url);
        if (!url) continue;

        const label =
          normalizeTitle(download.title ?? "") === normalizedTitle
            ? null
            : (download.title ?? null);

        await this.addMigratedSource(target.shop, target.objectId, url, label);

        await gamesSublevel.put(key, {
          ...legacyGame,
          isDeleted: true,
        });

        logger.info(
          `Migrated legacy custom game "${legacyGame.title}" to ${target.shop}:${target.objectId}`
        );
      }
    } catch (error) {
      logger.warn("Could not migrate legacy custom game links", error);
    }
  }
}

export const customGameSourceManager = new CustomGameSourceManager();
