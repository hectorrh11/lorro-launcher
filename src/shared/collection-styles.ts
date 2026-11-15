export type CollectionStyleEmblem =
  | "none"
  | "trophy"
  | "gem"
  | "star"
  | "check"
  | "clock"
  | "abandoned"
  | "package";

export interface CollectionVisualStyle {
  color?: string | null;
  emblem?: CollectionStyleEmblem;
  dimmed?: boolean;
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
}

export interface ResolvedVisualCollectionStyle {
  color: string | null;
  emblem: CollectionStyleEmblem;
  dimmed: boolean;
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
];

export const COLLECTION_STYLE_COLOR_PRESETS: readonly string[] = [
  "#7ec699",
  "#8fd3a1",
  "#c08b52",
  "#d7a878",
  "#e0b341",
  "#d98b8b",
  "#9a8ce0",
  "#6fb4d8",
  "#9a938a",
  "#8d857a",
];

const DEFAULT_COLLECTION_STYLES: Record<string, CollectionVisualStyle> = {
  terminado: { color: "#7ec699", emblem: "trophy", dimmed: false },
  finished: { color: "#7ec699", emblem: "trophy", dimmed: false },
  completed: { color: "#7ec699", emblem: "trophy", dimmed: false },
  completado: { color: "#7ec699", emblem: "trophy", dimmed: false },
  "100%": { color: "#7ec699", emblem: "trophy", dimmed: false },
  "en proceso": { color: "#c08b52", emblem: "clock", dimmed: false },
  "in progress": { color: "#c08b52", emblem: "clock", dimmed: false },
  jugando: { color: "#c08b52", emblem: "clock", dimmed: false },
  playing: { color: "#c08b52", emblem: "clock", dimmed: false },
  abandonado: { color: "#b98a8a", emblem: "abandoned", dimmed: true },
  abandoned: { color: "#b98a8a", emblem: "abandoned", dimmed: true },
  dropped: { color: "#b98a8a", emblem: "abandoned", dimmed: true },
  "no instalado": { color: "#9a938a", emblem: "gem", dimmed: true },
  "not installed": { color: "#9a938a", emblem: "gem", dimmed: true },
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

  const dimmed =
    typeof explicit?.dimmed === "boolean"
      ? explicit.dimmed
      : Boolean(defaults.dimmed);

  return { color, emblem, dimmed };
}

export function isCollectionStyleVisible(
  style: ResolvedVisualCollectionStyle
): boolean {
  return style.dimmed || style.color !== null || style.emblem !== "none";
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
