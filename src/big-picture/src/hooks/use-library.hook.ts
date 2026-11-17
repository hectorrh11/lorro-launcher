import { useCallback, useEffect, useMemo, useState } from "react";
import { filterAdultOnlyGames, isAdultContentFilterEnabled } from "@shared";
import { IS_DESKTOP } from "../constants";
import type { LibraryGame } from "@types";
import { useUserPreferences } from "./use-user-preferences.hook";

export function useLibrary() {
  const [downloadLibrary, setLibrary] = useState<LibraryGame[]>([]);
  const userPreferences = useUserPreferences();
  const hideAdultGames = isAdultContentFilterEnabled(userPreferences);
  const library = useMemo(
    () =>
      filterAdultOnlyGames(
        downloadLibrary.filter((game) => !game.isConcealed),
        hideAdultGames
      ),
    [downloadLibrary, hideAdultGames]
  );

  const updateLibrary = useCallback(async () => {
    if (!IS_DESKTOP) return;
    const updatedLibrary = await globalThis.window.electron.getLibrary(true);
    setLibrary(updatedLibrary);
  }, []);

  useEffect(() => {
    updateLibrary();

    if (!IS_DESKTOP) return;

    const unsubscribeLibraryBatch =
      globalThis.window.electron.onLibraryBatchComplete(() => {
        updateLibrary();
      });

    const unsubscribeDownloadsUpdated =
      globalThis.window.electron.onDownloadsUpdated(() => {
        updateLibrary();
      });

    const handleLibraryUpdate = () => updateLibrary();
    globalThis.window.addEventListener("library-update", handleLibraryUpdate);

    return () => {
      unsubscribeLibraryBatch();
      unsubscribeDownloadsUpdated();
      globalThis.window.removeEventListener(
        "library-update",
        handleLibraryUpdate
      );
    };
  }, [updateLibrary]);

  return { library, downloadLibrary, updateLibrary };
}
