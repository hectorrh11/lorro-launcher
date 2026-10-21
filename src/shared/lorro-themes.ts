export const LORRO_PURCHASABLE_THEMES = [
  "golden",
  "esmeralda",
  "ruby",
] as const;

export type LorroPurchasableTheme = (typeof LORRO_PURCHASABLE_THEMES)[number];

export const LORRO_THEME_PRICES: Record<LorroPurchasableTheme, number> = {
  golden: 300,
  esmeralda: 600,
  ruby: 900,
};

const LEGACY_THEME_ALIASES: Record<string, LorroPurchasableTheme> = {
  gold: "golden",
  emerald: "esmeralda",
};

export const isLorroPurchasableTheme = (
  value: string
): value is LorroPurchasableTheme =>
  (LORRO_PURCHASABLE_THEMES as readonly string[]).includes(value);

export const normalizeLorroThemeId = (
  value: string
): LorroPurchasableTheme | null => {
  if (isLorroPurchasableTheme(value)) return value;
  return LEGACY_THEME_ALIASES[value] ?? null;
};

export const normalizeLorroThemeIds = (
  values: string[] | null | undefined
): LorroPurchasableTheme[] => {
  if (!Array.isArray(values)) return [];

  const normalized = new Set<LorroPurchasableTheme>();

  for (const value of values) {
    const theme = normalizeLorroThemeId(value);
    if (theme) normalized.add(theme);
  }

  return [...normalized];
};

export interface LorroPointsSummary {
  earned: number;
  spent: number;
  balance: number;
  exact: boolean;
}
