import { FileZipIcon } from "@primer/octicons-react";
import {
  Button,
  CheckboxField,
  Modal,
  ProgressBar,
  RadioField,
} from "@renderer/components";
import { useLibrary, useToast } from "@renderer/hooks";
import type {
  GameZipImportError,
  GameZipImportInspection,
  GameZipImportPhase,
  GameZipImportProgress,
} from "@types";
import { formatBytes } from "@shared";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameDetailsContext } from "@renderer/context";

import "./zip-import-modal.scss";

interface ZipImportModalProps {
  visible: boolean;
  inspection: GameZipImportInspection | null;
  gameTitle: string;
  busy: boolean;
  progress: GameZipImportProgress | null;
  error: GameZipImportError | null;
  onClose: () => void;
  onCancel: () => void;
  onStart: (options: {
    mode: "copy" | "move";
    extractAutomatically: boolean;
    deleteZipAfterExtraction: boolean;
    overwrite: boolean;
  }) => void;
}

const phaseKeys: Record<GameZipImportPhase, string> = {
  preparing: "zip_import_phase_preparing",
  copying: "zip_import_phase_copying",
  moving: "zip_import_phase_moving",
  extracting: "zip_import_phase_extracting",
  verifying: "zip_import_phase_verifying",
  "detecting-executable": "zip_import_phase_detecting",
  done: "zip_import_phase_done",
};

const errorKeys: Record<GameZipImportError, string> = {
  "file-not-found": "zip_import_error_file_not_found",
  "invalid-zip": "zip_import_error_invalid_zip",
  "encrypted-zip": "zip_import_error_encrypted_zip",
  "unsafe-archive": "zip_import_error_unsafe_archive",
  "no-space": "zip_import_error_no_space",
  "permission-denied": "zip_import_error_permission_denied",
  "destination-conflict": "zip_import_error_conflict",
  "already-installed": "zip_import_error_already_installed",
  "game-not-found": "zip_import_error_game_not_found",
  "extract-failed": "zip_import_error_extract_failed",
  "verify-failed": "zip_import_error_verify_failed",
  cancelled: "zip_import_error_cancelled",
  unknown: "zip_import_error_unknown",
};

export function ZipImportModal({
  visible,
  inspection,
  gameTitle,
  busy,
  progress,
  error,
  onClose,
  onCancel,
  onStart,
}: ZipImportModalProps) {
  const { t } = useTranslation("game_details");
  const [mode, setMode] = useState<"copy" | "move">("copy");
  const [extractAutomatically, setExtractAutomatically] = useState(true);
  const [deleteZipAfterExtraction, setDeleteZipAfterExtraction] =
    useState(false);
  const [overwrite, setOverwrite] = useState(false);

  useEffect(() => {
    setMode("copy");
    setExtractAutomatically(true);
    setDeleteZipAfterExtraction(false);
    setOverwrite(false);
  }, [inspection?.destinationZipPath]);

  if (!inspection) return null;

  const hasConflicts = inspection.conflicts.length > 0;
  const done = !busy && progress?.phase === "done" && !error;
  const phase = progress?.phase ?? "preparing";
  const phaseProgress = Math.round((progress?.progress ?? 0) * 100);
  const canStart = !busy && (!hasConflicts || overwrite);

  return (
    <Modal
      visible={visible}
      title={t("zip_import_title", "Import from ZIP")}
      description={t(
        "zip_import_description",
        "Add the game files from a ZIP archive to {{title}}.",
        { title: gameTitle }
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
      clickOutsideToClose={!busy}
      large
    >
      <div className="zip-import-modal">
        <div className="zip-import-modal__summary">
          <div className="zip-import-modal__file">
            <FileZipIcon size={20} />
            <span title={inspection.fileName}>{inspection.fileName}</span>
          </div>
          <dl className="zip-import-modal__facts">
            <div>
              <dt>{t("zip_import_archive_size", "Archive size")}</dt>
              <dd>{formatBytes(inspection.fileSize)}</dd>
            </div>
            <div>
              <dt>{t("zip_import_entries", "Files")}</dt>
              <dd>{inspection.entryCount}</dd>
            </div>
            <div>
              <dt>{t("zip_import_extracted_size", "Extracted size")}</dt>
              <dd>≈ {formatBytes(inspection.extractedBytes)}</dd>
            </div>
            {inspection.freeBytes !== null && (
              <div>
                <dt>{t("zip_import_free_space", "Free space")}</dt>
                <dd>{formatBytes(inspection.freeBytes)}</dd>
              </div>
            )}
          </dl>
          <p className="zip-import-modal__destination">
            <span>{t("zip_import_destination", "Destination")}</span>
            <code title={inspection.destinationRoot}>
              {inspection.destinationRoot}
            </code>
          </p>
        </div>

        {error && (
          <p className="zip-import-modal__error" role="alert">
            {t(errorKeys[error], "Could not import the ZIP archive.")}
          </p>
        )}

        {busy || done ? (
          <div className="zip-import-modal__progress">
            <div className="zip-import-modal__progress-header">
              <span>{t(phaseKeys[phase], "Working…")}</span>
              {!done && <strong>{phaseProgress}%</strong>}
            </div>
            <ProgressBar
              now={done ? 100 : phaseProgress}
              max={100}
              label={t(phaseKeys[phase], "Working…")}
              completed={done}
              trackClassName="zip-import-modal__progress-track"
              barClassName="zip-import-modal__progress-bar"
            />
            {progress?.detail && (
              <p className="zip-import-modal__progress-detail">
                {progress.detail}
              </p>
            )}
            {done && (
              <p className="zip-import-modal__success">
                {t(
                  "zip_import_done",
                  "The archive was imported. Lorro will use it for this game."
                )}
              </p>
            )}
          </div>
        ) : (
          <>
            <fieldset className="zip-import-modal__options">
              <legend>{t("zip_import_mode", "Archive handling")}</legend>
              <RadioField
                name="zip-import-mode"
                checked={mode === "copy"}
                onChange={() => setMode("copy")}
                label={
                  <span className="zip-import-modal__option-label">
                    <strong>{t("zip_import_copy", "Copy")}</strong>
                    <small>
                      {t(
                        "zip_import_copy_description",
                        "Keeps the original ZIP where it is."
                      )}
                    </small>
                  </span>
                }
              />
              <RadioField
                name="zip-import-mode"
                checked={mode === "move"}
                onChange={() => setMode("move")}
                label={
                  <span className="zip-import-modal__option-label">
                    <strong>{t("zip_import_move", "Move")}</strong>
                    <small>
                      {t(
                        "zip_import_move_description",
                        "Removes the original only after a successful transfer."
                      )}
                    </small>
                  </span>
                }
              />
            </fieldset>

            <div className="zip-import-modal__checks">
              <CheckboxField
                label={t(
                  "zip_import_extract_automatically",
                  "Extract automatically"
                )}
                checked={extractAutomatically}
                onChange={(event) => {
                  setExtractAutomatically(event.target.checked);
                  if (!event.target.checked) setDeleteZipAfterExtraction(false);
                }}
              />
              <CheckboxField
                label={t(
                  "zip_import_delete_zip",
                  "Delete ZIP after extracting"
                )}
                checked={deleteZipAfterExtraction}
                disabled={!extractAutomatically}
                onChange={(event) =>
                  setDeleteZipAfterExtraction(event.target.checked)
                }
              />
              {!extractAutomatically && (
                <p className="zip-import-modal__hint">
                  {t(
                    "zip_import_extract_later_hint",
                    "The game will not be marked as installed. You can extract the ZIP later from the game page."
                  )}
                </p>
              )}
            </div>
          </>
        )}

        {hasConflicts && !busy && !done && (
          <div className="zip-import-modal__warning">
            <p>
              {t(
                "zip_import_conflict_warning",
                "A ZIP or folder with the same name already exists in the destination."
              )}
            </p>
            <CheckboxField
              label={t(
                "zip_import_overwrite",
                "Replace the existing ZIP and folder"
              )}
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
          </div>
        )}

        <div className="zip-import-modal__actions">
          {busy ? (
            <>
              <Button theme="outline" onClick={onCancel}>
                {t("zip_import_cancel", "Cancel import")}
              </Button>
              <span className="zip-import-modal__working">
                {t("zip_import_working", "Importing…")}
              </span>
            </>
          ) : (
            <>
              <Button theme="outline" onClick={onClose}>
                {t("close", "Close")}
              </Button>
              {!done && (
                <Button
                  disabled={!canStart}
                  onClick={() =>
                    onStart({
                      mode,
                      extractAutomatically,
                      deleteZipAfterExtraction,
                      overwrite,
                    })
                  }
                >
                  {t("zip_import_start", "Import")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

interface GameZipImportButtonProps {
  className?: string;
}

export function GameZipImportButton({
  className,
}: Readonly<GameZipImportButtonProps>) {
  const { game, shop, objectId, gameTitle, shopDetails, updateGame } =
    useContext(gameDetailsContext);
  const { updateLibrary } = useLibrary();
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("game_details");

  const [inspection, setInspection] = useState<GameZipImportInspection | null>(
    null
  );
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GameZipImportProgress | null>(null);
  const [error, setError] = useState<GameZipImportError | null>(null);
  const [extracting, setExtracting] = useState(false);
  const operationIdRef = useRef<string | null>(null);

  const isDeferredZip =
    Boolean(game?.download?.folderName?.toLowerCase().endsWith(".zip")) &&
    game?.download?.progress === 1 &&
    !game?.executablePath &&
    !game?.download?.extracting;

  useEffect(() => {
    return () => {
      const operationId = operationIdRef.current;
      if (operationId) {
        void window.electron.cancelGameZipImport(operationId);
      }
    };
  }, []);

  const pickZip = async () => {
    const result = await window.electron.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "ZIP archives", extensions: ["zip"] }],
    });

    if (result.canceled || !result.filePaths[0]) return;

    const inspected = await window.electron.inspectGameZipImport(
      shop,
      objectId!,
      result.filePaths[0]
    );

    if (!inspected.ok || !inspected.inspection) {
      showErrorToast(
        t(
          errorKeys[inspected.error ?? "invalid-zip"],
          "Could not use this ZIP archive."
        )
      );
      return;
    }

    setInspection(inspected.inspection);
    setProgress(null);
    setError(null);
    setVisible(true);
  };

  const startImport = async (options: {
    mode: "copy" | "move";
    extractAutomatically: boolean;
    deleteZipAfterExtraction: boolean;
    overwrite: boolean;
  }) => {
    if (!inspection) return;

    const operationId = crypto.randomUUID();
    operationIdRef.current = operationId;
    setBusy(true);
    setError(null);
    setProgress({
      operationId,
      shop,
      objectId: objectId!,
      phase: "preparing",
      progress: 0,
    });

    const stop = window.electron.onGameZipImportProgress((next) => {
      if (next.operationId === operationId) setProgress(next);
    });

    try {
      if (!game) {
        await window.electron.addGameToLibrary(
          shop,
          objectId!,
          gameTitle,
          shopDetails?.platform ?? null
        );
      }

      const result = await window.electron.importGameFromZip({
        operationId,
        shop,
        objectId: objectId!,
        zipPath: inspection.sourcePath,
        ...options,
      });

      if (result.ok) {
        showSuccessToast(
          result.installed
            ? t(
                "zip_import_success_installed",
                "Game imported and executable detected."
              )
            : t(
                "zip_import_success_not_installed",
                "ZIP imported. The game is not installed yet."
              )
        );
      } else if (result.error === "cancelled") {
        showErrorToast(t("zip_import_error_cancelled", "Import cancelled."));
      } else {
        const importError = result.error ?? "unknown";
        setError(importError);
        showErrorToast(
          t(errorKeys[importError], "Could not import the ZIP archive.")
        );
      }

      await Promise.all([updateLibrary(), updateGame()]);
    } catch {
      setError("unknown");
      showErrorToast(
        t("zip_import_error_unknown", "Could not import the ZIP archive.")
      );
    } finally {
      stop();
      setBusy(false);
      operationIdRef.current = null;
    }
  };

  const extractLater = async () => {
    setExtracting(true);
    try {
      await window.electron.extractGameDownload(shop, objectId!);
      showSuccessToast(
        t("zip_import_extract_later_started", "Extracting the ZIP archive…")
      );
      await Promise.all([updateLibrary(), updateGame()]);
    } catch {
      showErrorToast(
        t("zip_import_error_extract_failed", "Could not extract the ZIP.")
      );
    } finally {
      setExtracting(false);
    }
  };

  return (
    <>
      <Button
        theme="outline"
        className={className}
        onClick={() => void pickZip()}
        disabled={busy || extracting}
      >
        <FileZipIcon />
        {t("zip_import_button", "Import from ZIP")}
      </Button>

      {isDeferredZip && (
        <Button
          theme="outline"
          className={className}
          disabled={extracting}
          onClick={() => void extractLater()}
        >
          {t("zip_import_extract_later", "Extract downloaded ZIP")}
        </Button>
      )}

      <ZipImportModal
        visible={visible}
        inspection={inspection}
        gameTitle={gameTitle}
        busy={busy}
        progress={progress}
        error={error}
        onClose={() => {
          if (!busy) setVisible(false);
        }}
        onCancel={() => {
          const operationId = operationIdRef.current;
          if (operationId) {
            void window.electron.cancelGameZipImport(operationId);
          }
        }}
        onStart={(options) => void startImport(options)}
      />
    </>
  );
}
