import { SteamContentDescriptor } from "./constants";

/**
 * Only Steam's "adult only sexual content" descriptor marks games whose whole
 * point is explicit sex. Mature blockbusters such as GTA or Cyberpunk carry
 * other descriptors (violence, general mature content) and stay visible.
 */
export function hasAdultOnlySexualContent(
  contentDescriptorIds?: readonly number[] | null
): boolean {
  return Boolean(
    contentDescriptorIds?.includes(SteamContentDescriptor.AdultOnlySexualContent)
  );
}

export function isAdultOnlyContentGame(
  game: { adultOnlyContent?: boolean | null } | null | undefined
): boolean {
  return game?.adultOnlyContent === true;
}

/**
 * The filter ships enabled: only an explicit `false` keeps adult-only games
 * in the library.
 */
export function isAdultContentFilterEnabled(
  preferences?: { hideAdultOnlyGames?: boolean } | null
): boolean {
  return preferences?.hideAdultOnlyGames !== false;
}

export function filterAdultOnlyGames<
  T extends { adultOnlyContent?: boolean | null },
>(games: T[], enabled: boolean): T[] {
  return enabled ? games.filter((game) => !isAdultOnlyContentGame(game)) : games;
}
