export type CollectionStyleEmblem =
  | "none"
  | "trophy"
  | "gem"
  | "star"
  | "check"
  | "clock"
  | "abandoned"
  | "package"
  | "heart"
  | "flame"
  | "pin"
  | "bookmark"
  | "book"
  | "rocket"
  | "shield"
  | "sun"
  | "moon"
  | "zap"
  | "goal"
  | "tag"
  | "sparkle"
  | "beaker"
  | "broadcast"
  | "stop"
  | "slash"
  | "dot";

export interface CollectionVisualStyle {
  color?: string | null;
  emblem?: CollectionStyleEmblem;
  dimmed?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  uppercase?: boolean;
}

export type CollectionStyleMap = Record<string, CollectionVisualStyle>;

export interface CollectionStyleTarget {
  id: string;
  name: string;
}

export interface ResolvedCollectionStyle {
  collectionId: string;
  collectionName: string;
  color: string | null;
  emblem: CollectionStyleEmblem;
  dimmed: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  uppercase: boolean;
}

export interface ResolvedVisualCollectionStyle {
  color: string | null;
  emblem: CollectionStyleEmblem;
  dimmed: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  uppercase: boolean;
}

export const COLLECTION_STYLE_EMBLEMS: readonly CollectionStyleEmblem[] = [
  "none",
  "trophy",
  "gem",
  "star",
  "check",
  "clock",
  "abandoned",
  "package",
  "heart",
  "flame",
  "pin",
  "bookmark",
  "book",
  "rocket",
  "shield",
  "sun",
  "moon",
  "zap",
  "goal",
  "tag",
  "sparkle",
  "beaker",
  "broadcast",
  "stop",
  "slash",
  "dot",
];

export const COLLECTION_STYLE_COLOR_PRESETS: readonly string[] = [
  "#7ec699",
  "#58c9a3",
  "#4fb3bf",
  "#6fb4d8",
  "#7d9cf5",
  "#9a8ce0",
  "#b18cf0",
  "#e07aa8",
  "#d98b8b",
  "#f08c5a",
  "#e0b341",
  "#d7a878",
  "#c08b52",
  "#b98a8a",
  "#9a938a",
  "#cfd2d6",
  "#8fd3a1",
  "#8d857a",
];

const DEFAULT_COLLECTION_STYLES: Record<string, CollectionVisualStyle> = {
  terminado: { color: "#7ec699", emblem: "trophy", bold: true },
  finished: { color: "#7ec699", emblem: "trophy", bold: true },
  completed: { color: "#7ec699", emblem: "trophy", bold: true },
  completado: { color: "#7ec699", emblem: "trophy", bold: true },
  "100%": { color: "#7ec699", emblem: "trophy", bold: true },
  "en proceso": { color: "#c08b52", emblem: "clock" },
  "in progress": { color: "#c08b52", emblem: "clock" },
  jugando: { color: "#c08b52", emblem: "clock" },
  playing: { color: "#c08b52", emblem: "clock" },
  abandonado: { color: "#b98a8a", emblem: "abandoned", dimmed: true },
  abandoned: { color: "#b98a8a", emblem: "abandoned", dimmed: true },
  dropped: { color: "#b98a8a", emblem: "abandoned", dimmed: true },
  "no instalado": { color: "#9a938a", emblem: "gem", dimmed: true },
  "not installed": { color: "#9a938a", emblem: "gem", dimmed: true },
  favoritos: { color: "#e07aa8", emblem: "heart" },
  favorites: { color: "#e07aa8", emblem: "heart" },
  jugados: { color: "#6fb4d8", emblem: "book" },
  played: { color: "#6fb4d8", emblem: "book" },
  deseados: { color: "#9a8ce0", emblem: "star" },
  wishlist: { color: "#9a8ce0", emblem: "star" },
};

export function normalizeCollectionStyleKey(name: string): string {
  return name.trim().toLowerCase();
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isCollectionStyleColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim());
}

function normalizeEmblem(value: unknown): CollectionStyleEmblem {
  return COLLECTION_STYLE_EMBLEMS.includes(value as CollectionStyleEmblem)
    ? (value as CollectionStyleEmblem)
    : "none";
}

function resolveFlag(
  explicit: unknown,
  fallback: unknown
): boolean {
  return typeof explicit === "boolean" ? explicit : Boolean(fallback);
}

export function getDefaultCollectionStyle(
  collectionName: string
): CollectionVisualStyle {
  return (
    DEFAULT_COLLECTION_STYLES[normalizeCollectionStyleKey(collectionName)] ?? {}
  );
}

/**
 * Explicit per-collection style (stored in user preferences under the
 * collection id) wins over the name-based default, so the shipped defaults
 * keep working while the user customizes each collection.
 */
export function resolveCollectionStyle(
  collection: CollectionStyleTarget,
  styles?: CollectionStyleMap | null
): ResolvedVisualCollectionStyle {
  const defaults = getDefaultCollectionStyle(collection.name);
  const explicit = styles?.[collection.id];

  const color =
    (explicit && isCollectionStyleColor(explicit.color)
      ? explicit.color.trim()
      : null) ??
    (isCollectionStyleColor(defaults.color) ? defaults.color : null);

  const emblem = explicit?.emblem
    ? normalizeEmblem(explicit.emblem)
    : normalizeEmblem(defaults.emblem);

  return {
    color,
    emblem,
    dimmed: resolveFlag(explicit?.dimmed, defaults.dimmed),
    bold: resolveFlag(explicit?.bold, defaults.bold),
    italic: resolveFlag(explicit?.italic, defaults.italic),
    underline: resolveFlag(explicit?.underline, defaults.underline),
    strikethrough: resolveFlag(
      explicit?.strikethrough,
      defaults.strikethrough
    ),
    uppercase: resolveFlag(explicit?.uppercase, defaults.uppercase),
  };
}

export function isCollectionStyleVisible(
  style: ResolvedVisualCollectionStyle
): boolean {
  return (
    style.dimmed ||
    style.color !== null ||
    style.emblem !== "none" ||
    style.bold ||
    style.italic ||
    style.underline ||
    style.strikethrough ||
    style.uppercase
  );
}

/**
 * Picks the first collection of the game (in assignment order) that produces
 * a visible decoration, so neutral collections never hide a meaningful one.
 */
export function resolveGameCollectionStyle(
  collectionIds: readonly string[] | null | undefined,
  collections: readonly CollectionStyleTarget[] | null | undefined,
  styles?: CollectionStyleMap | null
): ResolvedCollectionStyle | null {
  if (!collectionIds?.length || !collections?.length) return null;

  for (const collectionId of collectionIds) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) continue;

    const style = resolveCollectionStyle(collection, styles);
    if (!isCollectionStyleVisible(style)) continue;

    return {
      collectionId: collection.id,
      collectionName: collection.name,
      ...style,
    };
  }

  return null;
}

export function updateCollectionStyle(
  styles: CollectionStyleMap | null | undefined,
  collectionId: string,
  patch: CollectionVisualStyle
): CollectionStyleMap {
  return {
    ...(styles ?? {}),
    [collectionId]: { ...(styles?.[collectionId] ?? {}), ...patch },
  };
}

export function clearCollectionStyle(
  styles: CollectionStyleMap | null | undefined,
  collectionId: string
): CollectionStyleMap {
  const next = { ...(styles ?? {}) };
  delete next[collectionId];
  return next;
}
