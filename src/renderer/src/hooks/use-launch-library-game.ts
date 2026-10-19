import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryGame } from "@types";
import { showExecutableOpenDialog } from "@renderer/helpers";
import { logger } from "@renderer/logger";
import { useToast } from "./use-toast";

export interface LaunchableLibraryGame {
  shop: LibraryGame["shop"];
  objectId: string;
  title: string;
  executablePath?: string | null;
  launchOptions?: string | null;
}

export function useLaunchLibraryGame() {
  const { t } = useTranslation("library");
  const { showErrorToast } = useToast();
  const [isLaunching, setIsLaunching] = useState(false);

  const launchGame = useCallback(
    async (game: LaunchableLibraryGame): Promise<boolean> => {
      if (isLaunching) return false;

      setIsLaunching(true);

      try {
        let executablePath = game.executablePath ?? null;

        if (!executablePath) {
          const { filePaths } = await showExecutableOpenDialog();
          const selectedExecutablePath = filePaths?.[0];

          if (!selectedExecutablePath) return false;

          executablePath = selectedExecutablePath;
          await window.electron.updateExecutablePath(
            game.shop,
            game.objectId,
            selectedExecutablePath
          );
        }

        if (!executablePath) return false;

        await window.electron.openGame(
          game.shop,
          game.objectId,
          executablePath,
          game.launchOptions ?? undefined
        );

        return true;
      } catch (error) {
        logger.error("Failed to launch game from library", error);
        showErrorToast(t("failed_to_launch_game"));
        return false;
      } finally {
        setIsLaunching(false);
      }
    },
    [isLaunching, showErrorToast, t]
  );

  return { launchGame, isLaunching };
}
