import type { Game } from "@types";
import { gamesShopCacheSublevel, gamesSublevel, levelKeys } from "@main/level";
import { hasAdultOnlySexualContent } from "@shared";
import { getSteamAppDetails } from "./steam";
import { updateGameRecord } from "./game-record-updater";
import { logger } from "./logger";

const MAX_GAMES_PER_RUN = 300;
const REQUEST_DELAY_MS = 1200;
const CACHE_KEY_PREFIX = "steam:";

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

type SteamCacheEntry = {
  content_descriptors?: { ids?: number[] } | null;
};

const readCachedFlags = async (): Promise<Map<string, boolean>> => {
  const flags = new Map<string, boolean>();

  for await (const [key, value] of gamesShopCacheSublevel.iterator()) {
    if (!key.startsWith(CACHE_KEY_PREFIX)) continue;

    const objectId = key.slice(CACHE_KEY_PREFIX.length).split(":")[0];
    if (!objectId) continue;

    const ids = (value as SteamCacheEntry | null)?.content_descriptors?.ids;
    flags.set(objectId, hasAdultOnlySexualContent(ids));
  }

  return flags;
};

const persistFlag = async (game: Game, adultOnlyContent: boolean) => {
  await updateGameRecord(levelKeys.game(game.shop, game.objectId), {
    adultOnlyContent,
  }).catch((error) => {
    logger.error("Could not persist adult content flag", error);
  });
};

/**
 * Backfills `adultOnlyContent` for Steam library games that were added before
 * the flag existed. Uses the cached Steam app details when available and falls
 * back to the public appdetails endpoint with a gentle request rate.
 */
export const startAdultContentScan = async (): Promise<void> => {
  try {
    const cachedFlags = await readCachedFlags();

    const pending: Game[] = [];
    for await (const [, game] of gamesSublevel.iterator()) {
      if (game.shop !== "steam" || game.isDeleted === true) continue;
      if (typeof game.adultOnlyContent === "boolean") continue;

      const cached = cachedFlags.get(game.objectId);
      if (cached !== undefined) {
        await persistFlag(game, cached);
        continue;
      }

      pending.push(game);
    }

    if (pending.length === 0) return;

    logger.info(
      `[AdultContentScan] Checking ${pending.length} games for adult-only content`
    );

    for (const game of pending.slice(0, MAX_GAMES_PER_RUN)) {
      const details = await getSteamAppDetails(game.objectId, "english").catch(
        () => null
      );

      if (!details) {
        await delay(REQUEST_DELAY_MS);
        continue;
      }

      await persistFlag(
        game,
        hasAdultOnlySexualContent(details.content_descriptors?.ids)
      );
      await delay(REQUEST_DELAY_MS);
    }

    logger.info("[AdultContentScan] Finished");
  } catch (error) {
    logger.error("[AdultContentScan] Failed", error);
  }
};
