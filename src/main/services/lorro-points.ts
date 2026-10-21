import { db, gamesSublevel, levelKeys } from "@main/level";
import { AchievementMemoryStore } from "./achievements/achievement-memory-store";
import type { UserPreferences } from "@types";
import {
  LORRO_THEME_PRICES,
  type LorroPointsSummary,
  isLorroPurchasableTheme,
  normalizeLorroThemeIds,
  type LorroPurchasableTheme,
} from "@shared";
import { logger } from "./logger";

const FALLBACK_POINTS_PER_ACHIEVEMENT = 10;

const computeEarnedPoints = async () => {
  const games = await gamesSublevel.values().all();
  let earned = 0;
  let exact = true;

  for (const game of games) {
    const unlockedCount = game.unlockedAchievementCount ?? 0;
    if (unlockedCount <= 0) continue;

    const memory = AchievementMemoryStore.get(game.shop, game.objectId);
    const catalogue = memory?.achievements ?? [];
    const unlocked = memory?.unlockedAchievements ?? [];

    if (catalogue.length && unlocked.length) {
      const unlockedNames = new Set(
        unlocked.map((item) => (item.name ?? "").toUpperCase())
      );
      let exactForGame = true;

      for (const achievement of catalogue) {
        if (!unlockedNames.has((achievement.name ?? "").toUpperCase()))
          continue;

        const points = achievement.points;
        if (typeof points === "number" && points > 0) {
          earned += points;
        } else {
          exactForGame = false;
        }
      }

      if (!exactForGame) {
        earned += unlockedCount * FALLBACK_POINTS_PER_ACHIEVEMENT;
        exact = false;
      }
    } else {
      earned += unlockedCount * FALLBACK_POINTS_PER_ACHIEVEMENT;
      exact = false;
    }
  }

  return { earned, exact };
};

class LorroPointsManager {
  async getSummary(): Promise<LorroPointsSummary> {
    const userPreferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    const { earned, exact } = await computeEarnedPoints();
    const spent = Math.max(0, userPreferences?.lorroSpentPoints ?? 0);

    return {
      earned,
      spent,
      balance: Math.max(0, earned - spent),
      exact,
    };
  }

  async purchaseTheme(
    themeId: string
  ): Promise<{ ok: boolean; message: string }> {
    if (!isLorroPurchasableTheme(themeId)) {
      return { ok: false, message: "Unknown theme." };
    }

    const price = LORRO_THEME_PRICES[themeId as LorroPurchasableTheme];

    const userPreferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    if (!userPreferences) {
      return { ok: false, message: "User preferences are unavailable." };
    }

    const owned = normalizeLorroThemeIds(userPreferences.ownedLorroThemes);
    if (owned.includes(themeId)) {
      return { ok: true, message: "Already owned." };
    }

    const { earned } = await computeEarnedPoints();
    const spent = Math.max(0, userPreferences.lorroSpentPoints ?? 0);
    const balance = Math.max(0, earned - spent);

    if (balance < price) {
      return {
        ok: false,
        message: `Not enough LorroPoints. You need ${price}, available ${balance}.`,
      };
    }

    try {
      await db.put<string, UserPreferences>(
        levelKeys.userPreferences,
        {
          ...userPreferences,
          ownedLorroThemes: [...owned, themeId],
          lorroSpentPoints: spent + price,
        },
        { valueEncoding: "json" }
      );
      logger.info(`[points] theme ${themeId} purchased for ${price}`);
      return { ok: true, message: "Theme unlocked." };
    } catch (error) {
      logger.error("[points] failed to persist theme purchase", error);
      return { ok: false, message: "Could not save the purchase." };
    }
  }
}

export const lorroPointsManager = new LorroPointsManager();
