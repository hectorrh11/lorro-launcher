import { randomUUID } from "node:crypto";
import { Game, GameSession, LorroGameStats, LorroStatsSummary } from "@types";
import { levelKeys } from "@main/level";
import { readJson, writeJson } from "./advanced-store";
import { logger } from "./logger";

const FILE = "game-sessions.json";

type Store = Record<string, LorroGameStats>;

let cache: Store | null = null;

function isoWeek(date: Date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

class SessionStats {
  private async load(): Promise<Store> {
    if (cache) return cache;

    const store = await readJson<Store>(FILE, {});
    const now = Date.now();
    let recovered = false;

    for (const stats of Object.values(store)) {
      for (const session of stats.sessions ?? []) {
        if (!session.end) {
          const start = new Date(session.start).getTime();
          session.end = new Date(Number.isFinite(start) ? start : now).toISOString();
          session.durationMs = Number.isFinite(start) ? Math.max(0, now - start) : 0;
          session.recovered = true;
          recovered = true;
        }
      }
    }

    cache = store;
    if (recovered) await writeJson(FILE, store);
    return store;
  }

  async startSession(game: Game) {
    const store = await this.load();
    const gameKey = levelKeys.game(game.shop, game.objectId);
    const stats = (store[gameKey] ??= {
      gameKey,
      gameTitle: game.title,
      sessions: [],
    });

    if (stats.sessions.some((session) => !session.end)) return;

    const session: GameSession = {
      id: randomUUID(),
      start: new Date().toISOString(),
      end: null,
      durationMs: 0,
    };

    stats.gameTitle = game.title;
    stats.sessions.push(session);
    await writeJson(FILE, store);
    logger.info(`[stats] session started for ${gameKey}`);
  }

  async endSession(game: Pick<Game, "shop" | "objectId" | "title">) {
    const store = await this.load();
    const gameKey = levelKeys.game(game.shop, game.objectId);
    const stats = store[gameKey];
    if (!stats) return;

    const session = [...stats.sessions].reverse().find((item) => !item.end);
    if (!session) return;

    const start = new Date(session.start).getTime();
    const end = Date.now();
    session.end = new Date(end).toISOString();
    session.durationMs = Math.max(0, end - (Number.isFinite(start) ? start : end));

    await writeJson(FILE, store);
    logger.info(`[stats] session ended for ${gameKey} (${session.durationMs}ms)`);
  }

  async list(): Promise<LorroGameStats[]> {
    const store = await this.load();
    return Object.values(store);
  }

  async get(gameKey: string): Promise<LorroGameStats | null> {
    const store = await this.load();
    return store[gameKey] ?? null;
  }

  async correctSession(gameKey: string, sessionId: string, durationMs: number) {
    const store = await this.load();
    const stats = store[gameKey];
    if (!stats) return null;

    const session = stats.sessions.find((item) => item.id === sessionId);
    if (!session) return null;

    const safeDuration = Math.max(0, Math.round(durationMs));
    const start = new Date(session.start).getTime();
    session.durationMs = safeDuration;
    session.end = new Date(start + safeDuration).toISOString();
    session.corrected = true;

    await writeJson(FILE, store);
    return stats;
  }

  async deleteSession(gameKey: string, sessionId: string) {
    const store = await this.load();
    const stats = store[gameKey];
    if (!stats) return null;

    stats.sessions = stats.sessions.filter((item) => item.id !== sessionId);
    await writeJson(FILE, store);
    return stats;
  }

  async summary(): Promise<LorroStatsSummary> {
    const store = await this.load();
    const sessions = Object.values(store).flatMap((stats) =>
      stats.sessions.map((session) => ({ session, stats }))
    );

    const finished = sessions.filter(
      (item): item is { session: GameSession & { end: string }; stats: LorroGameStats } =>
        Boolean(item.session.end)
    );

    const totalPlaytimeMs = finished.reduce((total, item) => total + item.session.durationMs, 0);

    const perGame = new Map<string, { gameKey: string; gameTitle: string; playtimeMs: number }>();
    const byDay = new Map<string, number>();
    const byWeek = new Map<string, number>();
    const byMonth = new Map<string, number>();

    for (const { session, stats } of finished) {
      const entry = perGame.get(stats.gameKey) ?? {
        gameKey: stats.gameKey,
        gameTitle: stats.gameTitle,
        playtimeMs: 0,
      };
      entry.playtimeMs += session.durationMs;
      perGame.set(stats.gameKey, entry);

      const start = new Date(session.start);
      if (Number.isNaN(start.getTime())) continue;

      const day = start.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const week = isoWeek(start);
      byDay.set(day, (byDay.get(day) ?? 0) + session.durationMs);
      byWeek.set(week, (byWeek.get(week) ?? 0) + session.durationMs);
      byMonth.set(month, (byMonth.get(month) ?? 0) + session.durationMs);
    }

    const sortEntries = (map: Map<string, number>, key: string) =>
      [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, value]) => ({ [key]: label, playtimeMs: value }));

    return {
      totalPlaytimeMs,
      totalSessions: finished.length,
      gamesPlayed: perGame.size,
      mostUsed: [...perGame.values()].sort((a, b) => b.playtimeMs - a.playtimeMs).slice(0, 8),
      byDay: sortEntries(byDay, "date") as LorroStatsSummary["byDay"],
      byWeek: sortEntries(byWeek, "week") as LorroStatsSummary["byWeek"],
      byMonth: sortEntries(byMonth, "month") as LorroStatsSummary["byMonth"],
    };
  }
}

export const sessionStats = new SessionStats();
