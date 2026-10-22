export type LorroCosmeticKind = "frame" | "title" | "wallpaper";

export interface LorroCosmeticItem {
  id: string;
  kind: LorroCosmeticKind;
  price: number;
}

export const LORRO_COSMETICS: LorroCosmeticItem[] = [
  { id: "frame-neon", kind: "frame", price: 250 },
  { id: "frame-sunset", kind: "frame", price: 450 },
  { id: "frame-gold", kind: "frame", price: 700 },
  { id: "frame-emerald", kind: "frame", price: 900 },
  { id: "frame-ruby", kind: "frame", price: 1100 },
  { id: "frame-aurora", kind: "frame", price: 1600 },
  { id: "frame-pixel", kind: "frame", price: 2000 },
  { id: "title-explorer", kind: "title", price: 300 },
  { id: "title-collector", kind: "title", price: 600 },
  { id: "title-marathon", kind: "title", price: 900 },
  { id: "title-hunter", kind: "title", price: 1200 },
  { id: "title-archivist", kind: "title", price: 1500 },
  { id: "title-legend", kind: "title", price: 2000 },
  { id: "wallpaper-aurora", kind: "wallpaper", price: 400 },
  { id: "wallpaper-sunset", kind: "wallpaper", price: 600 },
  { id: "wallpaper-ocean", kind: "wallpaper", price: 800 },
  { id: "wallpaper-nebula", kind: "wallpaper", price: 1000 },
  { id: "wallpaper-forest", kind: "wallpaper", price: 1200 },
  { id: "wallpaper-ember", kind: "wallpaper", price: 1500 },
];

export const LORRO_COSMETIC_KINDS: LorroCosmeticKind[] = [
  "frame",
  "title",
  "wallpaper",
];

const COSMETICS_BY_ID = new Map(LORRO_COSMETICS.map((item) => [item.id, item]));

export const isLorroCosmeticId = (value: string): boolean =>
  COSMETICS_BY_ID.has(value);

export const getLorroCosmetic = (
  value: string
): LorroCosmeticItem | undefined => COSMETICS_BY_ID.get(value);

export const getLorroCosmeticPrice = (value: string): number | null =>
  COSMETICS_BY_ID.get(value)?.price ?? null;

export const getLorroCosmeticsByKind = (
  kind: LorroCosmeticKind
): LorroCosmeticItem[] => LORRO_COSMETICS.filter((item) => item.kind === kind);

export const isLorroWallpaperId = (value: string): boolean =>
  COSMETICS_BY_ID.get(value)?.kind === "wallpaper";

export const normalizeLorroCosmeticIds = (
  values: string[] | null | undefined
): string[] => {
  if (!Array.isArray(values)) return [];

  const normalized = new Set<string>();

  for (const value of values) {
    if (isLorroCosmeticId(value)) normalized.add(value);
  }

  return [...normalized];
};
