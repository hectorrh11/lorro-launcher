import { useMemo } from "react";
import type { LibraryGame } from "@types";
import { resolveGameCollectionStyle } from "@shared";
import { useAppSelector } from "./redux";

export function useGameCollectionStyle(
  game: Pick<LibraryGame, "collectionIds">
) {
  const collections = useAppSelector((state) => state.collections.items);
  const collectionStyles = useAppSelector(
    (state) => state.userPreferences.value?.collectionStyles
  );
  const collectionIds = game.collectionIds;

  return useMemo(
    () =>
      resolveGameCollectionStyle(collectionIds, collections, collectionStyles),
    [collectionIds, collections, collectionStyles]
  );
}
