import { useTranslation } from "react-i18next";

import { ConfirmationModal } from "@renderer/components";
import { useLibrary, useToast } from "@renderer/hooks";
import { getGameExecutableFilters } from "@shared";
import type { GameShop } from "@types";

export interface DetectedExecutable {
  shop: GameShop;
  objectId: string;
  title: string;
  executablePath: string;
}

interface ExecutableDetectedModalProps {
  detection: DetectedExecutable | null;
  onClose: () => void;
}

const basenameOf = (filePath: string) =>
  filePath.split(/[/\\]/).filter(Boolean).pop() ?? filePath;

export function ExecutableDetectedModal({
  detection,
  onClose,
}: Readonly<ExecutableDetectedModalProps>) {
  const { t } = useTranslation("game_details");
  const { updateLibrary } = useLibrary();
  const { showErrorToast } = useToast();

  const executableName = detection
    ? basenameOf(detection.executablePath)
    : "";

  const handleConfirm = async () => {
    if (!detection) return;

    const { filePaths } = await window.electron.showOpenDialog({
      properties: ["openFile"],
      defaultPath: detection.executablePath,
      filters: getGameExecutableFilters(window.electron.platform, {
        executable: t("game_executable", "Game executable"),
        allFiles: t("all_files", "All files"),
      }),
    });

    const selectedPath = filePaths?.[0];

    if (!selectedPath) return;

    const gameUsingPath =
      await window.electron.verifyExecutablePathInUse(selectedPath);

    if (gameUsingPath) {
      showErrorToast(
        t("executable_path_in_use", {
          game: gameUsingPath.title,
          defaultValue: "That executable is already used by {{game}}",
        })
      );
      return;
    }

    await window.electron.updateExecutablePath(
      detection.shop,
      detection.objectId,
      selectedPath
    );

    await updateLibrary();
    onClose();
  };

  return (
    <ConfirmationModal
      visible={!!detection}
      title={t("executable_detected_title", {
        defaultValue: "Executable detected",
      })}
      descriptionText={t("executable_detected_description", {
        executable: executableName,
        title: detection?.title ?? "",
        defaultValue:
          "{{executable}} has been selected as the executable for {{title}}. Do you want to change it?",
      })}
      confirmButtonLabel={t("executable_detected_change", {
        defaultValue: "Change",
      })}
      cancelButtonLabel={t("executable_detected_keep", {
        defaultValue: "Keep",
      })}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}
