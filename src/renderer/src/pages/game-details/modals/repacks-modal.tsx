import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  PlusCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { Tooltip } from "react-tooltip";

import {
  Badge,
  Button,
  ConfirmationModal,
  Modal,
  TextField,
  CheckboxField,
  SteamIcon,
} from "@renderer/components";
import type {
  CustomGameSource,
  DownloadSource,
  Game,
  GameRepack,
} from "@types";

import { DownloadSettingsModal } from "./download-settings-modal";
import { gameDetailsContext } from "@renderer/context";
import {
  Downloader,
  getOfficialStoreMembers,
  isEpicMemberInCurrentScope,
} from "@shared";
import { orderBy } from "lodash-es";
import {
  useDate,
  useAppDispatch,
  useAppSelector,
  useIsNonSteamExecutable,
  useToast,
} from "@renderer/hooks";
import { clearNewDownloadOptions } from "@renderer/features";
import { levelDBService } from "@renderer/services/leveldb.service";
import {
  canDownloadOnSteam,
  getGameKey,
  isSteamImportedGame,
} from "@renderer/helpers";
import "./repacks-modal.scss";
import EpicLogo from "@renderer/assets/epic-integration-logo.svg?react";
import { EpicInstallModal } from "./epic-install-modal";
import { useEpicManagedConnection } from "@renderer/hooks/use-epic-managed";
import { useLibrary } from "@renderer/hooks";
import type { LibraryGame } from "@types";
import { epicInstallTiming } from "@renderer/helpers/epic-install-timing";

const getUrlHost = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
};

export interface RepacksModalProps {
  visible: boolean;
  startDownload: (
    repack: GameRepack,
    downloader: Downloader,
    downloadPath: string,
    automaticallyExtract: boolean,
    addToQueueOnly?: boolean,
    fileIndices?: number[],
    selectedFilesSize?: number | null,
    automaticallyDeleteArchiveFiles?: boolean,
    signal?: AbortSignal
  ) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function RepacksModal({
  visible,
  startDownload,
  onClose,
}: Readonly<RepacksModalProps>) {
  const [filteredRepacks, setFilteredRepacks] = useState<GameRepack[]>([]);
  const [repack, setRepack] = useState<GameRepack | null>(null);
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [showCustomLinkModal, setShowCustomLinkModal] = useState(false);
  const [customLinkUrl, setCustomLinkUrl] = useState("");
  const [customLinkTitle, setCustomLinkTitle] = useState("");
  const [customLinkError, setCustomLinkError] = useState("");
  const [customSources, setCustomSources] = useState<CustomGameSource[]>([]);
  const [editingCustomSource, setEditingCustomSource] =
    useState<CustomGameSource | null>(null);
  const [deletingCustomSource, setDeletingCustomSource] =
    useState<CustomGameSource | null>(null);
  const [savingCustomSource, setSavingCustomSource] = useState(false);
  const [downloadSources, setDownloadSources] = useState<DownloadSource[]>([]);
  const [selectedFingerprints, setSelectedFingerprints] = useState<string[]>(
    []
  );
  const [filterTerm, setFilterTerm] = useState("");

  const [lastCheckTimestamp, setLastCheckTimestamp] = useState<string | null>(
    null
  );
  const [isLoadingTimestamp, setIsLoadingTimestamp] = useState(true);
  const [viewedRepackIds, setViewedRepackIds] = useState<Set<string>>(
    new Set()
  );

  const { game, presentation, repacks, updateGame, catalogueGame } =
    useContext(gameDetailsContext);
  const { steam: steamGame, epic: epicGame } = getOfficialStoreMembers(
    presentation?.members ?? (game ? [game] : [])
  );
  const { installationAvailable: epicAvailable, connection } =
    useEpicManagedConnection();
  const { updateLibrary } = useLibrary();
  const [epicInstallGame, setEpicInstallGame] = useState<LibraryGame | null>(
    null
  );
  const activeEpicInstallGame =
    epicInstallGame?.epicImportScope &&
    epicGame &&
    epicInstallGame.objectId === epicGame.objectId &&
    epicInstallGame.epicImportScope.environment ===
      epicGame.epicImportScope?.environment &&
    epicInstallGame.epicImportScope.userId ===
      epicGame.epicImportScope?.userId &&
    epicInstallGame.epicImportScope.connectionId ===
      epicGame.epicImportScope?.connectionId
      ? epicInstallGame
      : null;
  useEffect(() => {
    if (epicInstallGame && !activeEpicInstallGame) setEpicInstallGame(null);
  }, [epicInstallGame, activeEpicInstallGame]);

  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();

  const sourceShop = catalogueGame?.shop ?? game?.shop;
  const sourceObjectId = catalogueGame?.objectId || game?.objectId;

  const refreshCustomSources = useCallback(async () => {
    if (!sourceShop || !sourceObjectId) {
      setCustomSources([]);
      return;
    }

    try {
      const sources = await window.electron.getCustomGameSources(
        sourceShop,
        sourceObjectId
      );
      setCustomSources(sources);
    } catch {
      setCustomSources([]);
    }
  }, [sourceShop, sourceObjectId]);

  useEffect(() => {
    if (visible) void refreshCustomSources();
  }, [visible, refreshCustomSources]);

  const { formatDate } = useDate();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  useEffect(() => {
    const fetchDownloadSources = async () => {
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sorted = orderBy(sources, "createdAt", "desc");
      setDownloadSources(sorted);
    };

    fetchDownloadSources();
  }, []);

  useEffect(() => {
    const fetchLastCheckTimestamp = async () => {
      setIsLoadingTimestamp(true);

      try {
        const timestamp = (await levelDBService.get(
          "downloadSourcesSinceValue",
          null,
          "utf8"
        )) as string | null;

        setLastCheckTimestamp(timestamp);
      } catch {
        setLastCheckTimestamp(null);
      } finally {
        setIsLoadingTimestamp(false);
      }
    };

    if (visible && userPreferences?.enableNewDownloadOptionsBadges !== false) {
      fetchLastCheckTimestamp();
    } else {
      setIsLoadingTimestamp(false);
    }
  }, [visible, repacks, userPreferences?.enableNewDownloadOptionsBadges]);

  useEffect(() => {
    if (
      visible &&
      game?.newDownloadOptionsCount &&
      game.newDownloadOptionsCount > 0
    ) {
      const gameKey = getGameKey(game.shop, game.objectId);
      levelDBService
        .get(gameKey, "games")
        .then((gameData) => {
          if (gameData) {
            const updated = {
              ...(gameData as Game),
              newDownloadOptionsCount: undefined,
            };
            return levelDBService.put(gameKey, updated, "games");
          }
          return Promise.resolve();
        })
        .catch(() => {});

      const gameId = `${game.shop}:${game.objectId}`;
      dispatch(clearNewDownloadOptions({ gameId }));
    }
  }, [visible, game, dispatch]);

  const customRepacks = useMemo<GameRepack[]>(
    () =>
      customSources.map((source) => ({
        id: `custom-source-${source.id}`,
        title:
          source.label?.trim() ||
          game?.title ||
          t("custom_download_button", { ns: "downloads" }),
        fileSize: null,
        uris: [source.url],
        unavailableUris: [],
        uploadDate: null,
        downloadSourceId: `custom-source-${source.id}`,
        downloadSourceName: t("custom_source_label", { ns: "downloads" }),
        createdAt: source.createdAt,
        isCustom: true,
        customSourceId: source.id,
      })),
    [customSources, game?.title, t]
  );

  const sortedRepacks = useMemo(() => {
    return orderBy(
      [...customRepacks, ...repacks],
      [(repack) => (repack.isCustom ? 0 : 1), (repack) => repack.uploadDate],
      ["asc", "desc"]
    );
  }, [customRepacks, repacks]);

  const getRepackAvailabilityStatus = (
    repack: GameRepack
  ): "online" | "partial" | "offline" => {
    const uris = Array.isArray(repack.uris) ? repack.uris : [];
    const unavailableSet = new Set(repack.unavailableUris ?? []);
    const availableCount = uris.filter(
      (uri) => !unavailableSet.has(uri)
    ).length;
    const unavailableCount = uris.length - availableCount;

    if (uris.length === 0) return "offline";
    if (unavailableCount === 0) return "online";
    if (availableCount === 0) return "offline";
    return "partial";
  };

  useEffect(() => {
    const term = filterTerm.trim().toLowerCase();

    const byTerm = sortedRepacks.filter((repack) => {
      if (!term) return true;
      const lowerTitle = repack.title.toLowerCase();
      const lowerRepacker = repack.downloadSourceName.toLowerCase();
      return lowerTitle.includes(term) || lowerRepacker.includes(term);
    });

    const bySource = byTerm.filter((repack) => {
      if (repack.isCustom || selectedFingerprints.length === 0) return true;

      return downloadSources.some(
        (src) =>
          src.fingerprint &&
          selectedFingerprints.includes(src.fingerprint) &&
          src.name === repack.downloadSourceName
      );
    });

    setFilteredRepacks(bySource);
  }, [sortedRepacks, filterTerm, selectedFingerprints, downloadSources]);

  const handleRepackClick = (repack: GameRepack) => {
    setRepack(repack);
    setShowSelectFolderModal(true);
    setViewedRepackIds((prev) => new Set(prev).add(repack.id));
  };

  const openCustomLinkModal = (source?: CustomGameSource) => {
    setEditingCustomSource(source ?? null);
    setCustomLinkUrl(source?.url ?? "");
    setCustomLinkTitle(source?.label ?? "");
    setCustomLinkError("");
    setShowCustomLinkModal(true);
  };

  const closeCustomLinkModal = () => {
    setShowCustomLinkModal(false);
    setEditingCustomSource(null);
    setCustomLinkUrl("");
    setCustomLinkTitle("");
    setCustomLinkError("");
    setSavingCustomSource(false);
  };

  const handleCustomLinkSubmit: React.FormEventHandler<
    HTMLFormElement
  > = async (event) => {
    event.preventDefault();

    if (!sourceShop || !sourceObjectId) return;

    const url = customLinkUrl.trim();

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      setCustomLinkError(t("custom_download_invalid_url", { ns: "downloads" }));
      return;
    }

    setSavingCustomSource(true);

    try {
      const result = editingCustomSource
        ? await window.electron.updateCustomGameSource(
            sourceShop,
            sourceObjectId,
            editingCustomSource.id,
            url,
            customLinkTitle
          )
        : await window.electron.addCustomGameSource(
            sourceShop,
            sourceObjectId,
            url,
            customLinkTitle
          );

      if (!result.ok) {
        setCustomLinkError(
          t(
            result.error === "duplicate"
              ? "custom_source_error_duplicate"
              : "custom_download_invalid_url",
            { ns: "downloads" }
          )
        );
        return;
      }

      await refreshCustomSources();
      showSuccessToast(
        t(
          editingCustomSource ? "custom_source_updated" : "custom_source_saved",
          { ns: "downloads" }
        )
      );
      closeCustomLinkModal();
    } catch {
      setCustomLinkError(t("custom_download_failed", { ns: "downloads" }));
    } finally {
      setSavingCustomSource(false);
    }
  };

  const handleDeleteCustomSource = async () => {
    if (!deletingCustomSource || !sourceShop || !sourceObjectId) return;

    try {
      await window.electron.deleteCustomGameSource(
        sourceShop,
        sourceObjectId,
        deletingCustomSource.id
      );
      await refreshCustomSources();
      showSuccessToast(t("custom_source_deleted", { ns: "downloads" }));
    } catch {
      showErrorToast(
        t("custom_download_failed", { ns: "downloads" }),
        t("custom_source_delete_failed", { ns: "downloads" })
      );
    } finally {
      setDeletingCustomSource(null);
    }
  };

  const handleFilter: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setFilterTerm(event.target.value);
  };

  const toggleFingerprint = (fingerprint: string) => {
    setSelectedFingerprints((prev) =>
      prev.includes(fingerprint)
        ? prev.filter((f) => f !== fingerprint)
        : [...prev, fingerprint]
    );
  };

  const checkIfLastDownloadedOption = (repack: GameRepack) => {
    if (!game?.download) return false;
    if (!Array.isArray(repack.uris)) return false;
    return repack.uris.some((uri) => uri.includes(game.download!.uri));
  };

  const isNewRepack = (repack: GameRepack): boolean => {
    if (isLoadingTimestamp) return false;

    if (repack.isCustom) return false;

    if (viewedRepackIds.has(repack.id)) return false;

    if (!lastCheckTimestamp || !repack.createdAt) {
      return false;
    }

    try {
      const lastCheckDate = new Date(lastCheckTimestamp);

      if (isNaN(lastCheckDate.getTime())) {
        return false;
      }

      const lastCheckUtc = lastCheckDate.toISOString();

      return repack.createdAt > lastCheckUtc;
    } catch {
      return false;
    }
  };

  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const steamOptionTerm = filterTerm.trim().toLowerCase();
  const isNonSteamExecutable = useIsNonSteamExecutable(steamGame);
  const showSteamOption =
    (canDownloadOnSteam(steamGame) ||
      (isSteamImportedGame(steamGame) && isNonSteamExecutable)) &&
    selectedFingerprints.length === 0 &&
    (!steamOptionTerm ||
      "steam".includes(steamOptionTerm) ||
      (game?.title ?? "").toLowerCase().includes(steamOptionTerm));
  const showEpicOption =
    epicAvailable &&
    isEpicMemberInCurrentScope(epicGame, connection) &&
    selectedFingerprints.length === 0 &&
    (!steamOptionTerm ||
      "epic games".includes(steamOptionTerm) ||
      (game?.title ?? "").toLowerCase().includes(steamOptionTerm));

  const handleSteamOptionClick = () => {
    if (!steamGame) return;

    void window.electron.installGameOnSteam(steamGame.objectId);
    onClose();
  };

  useEffect(() => {
    if (!visible) {
      setFilterTerm("");
      setSelectedFingerprints([]);
      setIsFilterDrawerOpen(false);
      setShowCustomLinkModal(false);
      setEditingCustomSource(null);
      setDeletingCustomSource(null);
      setCustomLinkUrl("");
      setCustomLinkTitle("");
      setCustomLinkError("");
      setSavingCustomSource(false);
    }
  }, [visible]);

  return (
    <>
      <DownloadSettingsModal
        visible={showSelectFolderModal}
        onClose={() => setShowSelectFolderModal(false)}
        startDownload={startDownload}
        repack={repack}
      />
      <Modal
        visible={showCustomLinkModal}
        title={t(
          editingCustomSource
            ? "custom_source_edit_title"
            : "custom_source_add_title",
          { ns: "downloads" }
        )}
        description={t(
          editingCustomSource
            ? "custom_source_edit_description"
            : "custom_source_add_description",
          { ns: "downloads" }
        )}
        onClose={closeCustomLinkModal}
      >
        <form
          className="repacks-modal__custom-form"
          onSubmit={handleCustomLinkSubmit}
        >
          <TextField
            label={t("custom_download_url_label", { ns: "downloads" })}
            placeholder="https://example.com/game.zip"
            value={customLinkUrl}
            onChange={(event) => setCustomLinkUrl(event.target.value)}
          />
          <TextField
            label={t("custom_download_title_label", { ns: "downloads" })}
            placeholder={t("custom_download_title_placeholder", {
              ns: "downloads",
            })}
            value={customLinkTitle}
            onChange={(event) => setCustomLinkTitle(event.target.value)}
          />
          {customLinkError && (
            <p className="repacks-modal__custom-error">{customLinkError}</p>
          )}
          <div className="repacks-modal__custom-actions">
            <Button type="submit" theme="primary" disabled={savingCustomSource}>
              <LinkIcon />
              {savingCustomSource
                ? t("loading")
                : t(
                    editingCustomSource
                      ? "custom_source_save_changes"
                      : "custom_source_save",
                    { ns: "downloads" }
                  )}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        visible={deletingCustomSource !== null}
        title={t("custom_source_delete_title", { ns: "downloads" })}
        descriptionText={t("custom_source_delete_description", {
          ns: "downloads",
        })}
        confirmButtonLabel={t("custom_source_delete_confirm", {
          ns: "downloads",
        })}
        cancelButtonLabel={t("custom_download_cancel_action", {
          ns: "downloads",
        })}
        onConfirm={() => void handleDeleteCustomSource()}
        onClose={() => setDeletingCustomSource(null)}
      />
      <EpicInstallModal
        game={activeEpicInstallGame}
        presentationGame={activeEpicInstallGame ? (presentation ?? game) : null}
        onClose={() => setEpicInstallGame(null)}
        onStarted={() => {
          setEpicInstallGame(null);
          void Promise.all([updateLibrary(), updateGame()]);
          onClose();
        }}
      />

      <Modal
        visible={visible}
        title={t("download_options_title")}
        description={t("repacks_modal_description")}
        onClose={onClose}
      >
        <div
          className={`repacks-modal__filter-container ${isFilterDrawerOpen ? "repacks-modal__filter-container--drawer-open" : ""}`}
        >
          <div className="repacks-modal__filter-top">
            <TextField
              placeholder={t("filter")}
              value={filterTerm}
              onChange={handleFilter}
            />
            {downloadSources.length > 0 && (
              <Button
                type="button"
                theme="outline"
                onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
                className="repacks-modal__filter-toggle"
              >
                {t("filter_by_source")}
                {isFilterDrawerOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </Button>
            )}
          </div>

          <div
            className={`repacks-modal__download-sources ${isFilterDrawerOpen ? "repacks-modal__download-sources--open" : ""}`}
          >
            <div className="repacks-modal__source-grid">
              {downloadSources
                .filter(
                  (
                    source
                  ): source is DownloadSource & { fingerprint: string } =>
                    source.fingerprint !== undefined
                )
                .map((source) => {
                  const label = source.name || source.url;
                  const truncatedLabel =
                    label.length > 16 ? label.substring(0, 16) + "..." : label;
                  return (
                    <div
                      key={source.fingerprint}
                      className="repacks-modal__source-item"
                    >
                      <CheckboxField
                        label={truncatedLabel}
                        checked={selectedFingerprints.includes(
                          source.fingerprint
                        )}
                        onChange={() => toggleFingerprint(source.fingerprint)}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="repacks-modal__custom-link">
          <Button
            type="button"
            theme="outline"
            onClick={() => openCustomLinkModal()}
          >
            <LinkIcon />
            {t("custom_source_add", { ns: "downloads" })}
          </Button>
        </div>

        <div className="repacks-modal__repacks">
          {showSteamOption && game && (
            <Button
              theme="dark"
              onClick={handleSteamOptionClick}
              className="repacks-modal__repack-button"
            >
              <span
                className="repacks-modal__availability-orb repacks-modal__availability-orb--online"
                data-tooltip-id="availability-orb-steam"
                data-tooltip-content={t("source_online")}
              />
              <Tooltip id="availability-orb-steam" />

              <p className="repacks-modal__repack-title repacks-modal__steam-title">
                <SteamIcon size={16} />
                {game.title}
              </p>

              <p className="repacks-modal__repack-info">
                {t("download_on_steam")}
              </p>
            </Button>
          )}

          {showEpicOption && epicGame && (
            <Button
              theme="dark"
              onClick={() => {
                if (epicGame) epicInstallTiming.beginOptions(epicGame.objectId);
                setEpicInstallGame(epicGame);
              }}
              className="repacks-modal__repack-button"
            >
              <p className="repacks-modal__repack-title repacks-modal__steam-title">
                <EpicLogo width={16} height={16} aria-hidden="true" />
                {game?.title ?? epicGame.title}
              </p>
              <p className="repacks-modal__repack-info">
                {t("download_on_epic")}
              </p>
            </Button>
          )}

          {(showSteamOption || showEpicOption) &&
            filteredRepacks.length > 0 && (
              <div className="repacks-modal__separator" />
            )}

          {filteredRepacks.length === 0
            ? !showSteamOption &&
              !showEpicOption && (
                <div className="repacks-modal__no-results">
                  <div className="repacks-modal__no-results-content">
                    <div className="repacks-modal__no-results-text">
                      {t("no_repacks_found")}
                    </div>
                    <div className="repacks-modal__no-results-button">
                      <Button
                        type="button"
                        theme="primary"
                        onClick={() => openCustomLinkModal()}
                      >
                        <LinkIcon />
                        {t("custom_source_add", { ns: "downloads" })}
                      </Button>
                      <Button
                        type="button"
                        theme="outline"
                        onClick={() => {
                          onClose();
                          navigate("/settings?tab=download_sources");
                        }}
                      >
                        <PlusCircleIcon />
                        {t("add_download_source", { ns: "settings" })}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            : filteredRepacks.map((repack) => {
                const isLastDownloadedOption =
                  checkIfLastDownloadedOption(repack);
                const availabilityStatus = getRepackAvailabilityStatus(repack);
                const tooltipId = `availability-orb-${repack.id}`;
                const customSource = repack.customSourceId
                  ? customSources.find(
                      (source) => source.id === repack.customSourceId
                    )
                  : undefined;
                const customSourceHost = customSource
                  ? getUrlHost(customSource.url)
                  : null;

                const repackButton = (
                  <Button
                    theme="dark"
                    onClick={() => handleRepackClick(repack)}
                    className="repacks-modal__repack-button"
                  >
                    <span
                      className={`repacks-modal__availability-orb repacks-modal__availability-orb--${availabilityStatus}`}
                      data-tooltip-id={tooltipId}
                      data-tooltip-content={t(`source_${availabilityStatus}`)}
                    />
                    <Tooltip id={tooltipId} />

                    <p className="repacks-modal__repack-title">
                      {repack.title}
                      {userPreferences?.enableNewDownloadOptionsBadges !==
                        false &&
                        isNewRepack(repack) && (
                          <span className="repacks-modal__new-badge">
                            {t("new_download_option")}
                          </span>
                        )}
                    </p>

                    {isLastDownloadedOption && (
                      <Badge>{t("last_downloaded_option")}</Badge>
                    )}

                    <p className="repacks-modal__repack-info">
                      {customSource
                        ? `${t("custom_source_label", { ns: "downloads" })} - ${customSourceHost}`
                        : `${repack.fileSize} - ${repack.downloadSourceName} - ${
                            repack.uploadDate
                              ? formatDate(repack.uploadDate)
                              : ""
                          }`}
                    </p>
                  </Button>
                );

                if (customSource) {
                  return (
                    <div
                      key={repack.id}
                      className="repacks-modal__custom-source-row"
                    >
                      {repackButton}
                      <div className="repacks-modal__custom-source-actions">
                        <Button
                          type="button"
                          theme="outline"
                          title={t("custom_source_edit", { ns: "downloads" })}
                          aria-label={t("custom_source_edit", {
                            ns: "downloads",
                          })}
                          onClick={() => openCustomLinkModal(customSource)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          type="button"
                          theme="outline"
                          title={t("custom_source_delete", {
                            ns: "downloads",
                          })}
                          aria-label={t("custom_source_delete", {
                            ns: "downloads",
                          })}
                          onClick={() => setDeletingCustomSource(customSource)}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </div>
                  );
                }

                return <Fragment key={repack.id}>{repackButton}</Fragment>;
              })}
        </div>
      </Modal>
    </>
  );
}
