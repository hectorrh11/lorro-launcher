import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { formatBytes, formatDate } from "@shared";
import type {
  ProtonInstallProgress,
  ProtonOfficialChannel,
  ProtonRelease,
} from "@types";
import "./proton-downloads.scss";

interface ProtonDownloadsProps {
  onInstalled?: (path?: string) => void | Promise<void>;
}

const getPhaseLabelKey = (phase: ProtonInstallProgress["phase"]) =>
  `proton_downloads_${phase}`;

export function ProtonDownloads({
  onInstalled,
}: Readonly<ProtonDownloadsProps>) {
  const { t, i18n } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();
  const [releases, setReleases] = useState<ProtonRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [progress, setProgress] = useState<ProtonInstallProgress | null>(null);
  const [installingTag, setInstallingTag] = useState<string | null>(null);
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [confirmingTag, setConfirmingTag] = useState<string | null>(null);
  const [openingOfficial, setOpeningOfficial] =
    useState<ProtonOfficialChannel | null>(null);

  const loadReleases = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);

    try {
      setReleases(
        await globalThis.window.electron.getAvailableProtonReleases()
      );
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  useEffect(
    () => globalThis.window.electron.onProtonInstallProgress(setProgress),
    []
  );

  const progressPercent = useMemo(() => {
    if (!progress || progress.totalBytes <= 0) return 0;

    return Math.min(
      100,
      Math.round((progress.receivedBytes / progress.totalBytes) * 100)
    );
  }, [progress]);

  const handleInstall = async (release: ProtonRelease) => {
    setInstallingTag(release.tag);
    setProgress(null);

    try {
      const result = await globalThis.window.electron.installProtonRelease(
        release.tag
      );

      if (!result.ok) {
        showErrorToast(t("proton_downloads_install_error"), result.message);
        return;
      }

      showSuccessToast(t("proton_downloads_install_success"), release.tag);
      await loadReleases();
      await onInstalled?.(result.path);
    } finally {
      setInstallingTag(null);
      setProgress(null);
    }
  };

  const handleRemove = async (tag: string) => {
    setRemovingTag(tag);

    try {
      const result =
        await globalThis.window.electron.uninstallProtonRelease(tag);

      if (!result.ok) {
        showErrorToast(t("proton_downloads_remove_error"), result.message);
        return;
      }

      showSuccessToast(t("proton_downloads_removed"), tag);
      setConfirmingTag(null);
      await loadReleases();
      await onInstalled?.();
    } finally {
      setRemovingTag(null);
    }
  };

  const handleOpenOfficial = async (channel: ProtonOfficialChannel) => {
    setOpeningOfficial(channel);

    try {
      const result =
        await globalThis.window.electron.installOfficialProton(channel);

      if (!result.ok) {
        showErrorToast(t("proton_downloads_official_error"), result.message);
        return;
      }

      showSuccessToast(t("proton_downloads_official_opened"), result.message);
    } finally {
      setOpeningOfficial(null);
    }
  };

  return (
    <div className="proton-downloads">
      <div className="proton-downloads__header">
        <div>
          <h2>{t("proton_downloads_title")}</h2>
          <h4 className="proton-downloads__description">
            {t("proton_downloads_description")}
          </h4>
        </div>

        <Button
          type="button"
          theme="outline"
          size="small"
          onClick={() => void loadReleases()}
          disabled={loading || Boolean(installingTag)}
        >
          {t("proton_downloads_refresh")}
        </Button>
      </div>

      {loading && (
        <p className="proton-downloads__status">
          {t("proton_downloads_loading")}
        </p>
      )}

      {!loading && loadFailed && (
        <div className="proton-downloads__status proton-downloads__status--error">
          <span>{t("proton_downloads_error")}</span>
          <Button
            type="button"
            theme="outline"
            size="small"
            onClick={() => void loadReleases()}
          >
            {t("proton_downloads_refresh")}
          </Button>
        </div>
      )}

      {!loading && !loadFailed && releases.length === 0 && (
        <p className="proton-downloads__status">
          {t("proton_downloads_empty")}
        </p>
      )}

      {!loading && !loadFailed && releases.length > 0 && (
        <ul className="proton-downloads__list">
          {releases.map((release) => {
            const isInstalling = installingTag === release.tag;
            const isRemoving = removingTag === release.tag;

            return (
              <li className="proton-downloads__item" key={release.tag}>
                <div className="proton-downloads__info">
                  <span className="proton-downloads__name">{release.tag}</span>
                  <span className="proton-downloads__meta">
                    {formatDate(release.publishedAt, i18n.language)} ·{" "}
                    {formatBytes(release.size)}
                  </span>

                  {isInstalling && progress && (
                    <div className="proton-downloads__progress">
                      <div className="proton-downloads__progress-bar">
                        <span
                          className="proton-downloads__progress-fill"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="proton-downloads__progress-label">
                        {t(getPhaseLabelKey(progress.phase))} ·{" "}
                        {progressPercent}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="proton-downloads__actions">
                  {release.installed ? (
                    confirmingTag === release.tag ? (
                      <>
                        <span className="proton-downloads__confirm">
                          {t("proton_downloads_confirm_remove")}
                        </span>
                        <Button
                          type="button"
                          theme="danger"
                          size="small"
                          disabled={isRemoving}
                          onClick={() => void handleRemove(release.tag)}
                        >
                          {t("proton_downloads_remove")}
                        </Button>
                        <Button
                          type="button"
                          theme="outline"
                          size="small"
                          disabled={isRemoving}
                          onClick={() => setConfirmingTag(null)}
                        >
                          {t("proton_downloads_cancel")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="proton-downloads__installed">
                          {t("proton_downloads_installed")}
                        </span>
                        <Button
                          type="button"
                          theme="outline"
                          size="small"
                          disabled={Boolean(installingTag)}
                          onClick={() => setConfirmingTag(release.tag)}
                        >
                          {t("proton_downloads_remove")}
                        </Button>
                      </>
                    )
                  ) : (
                    <Button
                      type="button"
                      size="small"
                      disabled={Boolean(installingTag)}
                      onClick={() => void handleInstall(release)}
                    >
                      {t("proton_downloads_install")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="proton-downloads__official">
        <h3>{t("proton_downloads_official_title")}</h3>
        <p className="proton-downloads__official-description">
          {t("proton_downloads_official_description")}
        </p>

        <div className="proton-downloads__official-actions">
          <Button
            type="button"
            theme="outline"
            size="small"
            disabled={Boolean(openingOfficial)}
            onClick={() => void handleOpenOfficial("experimental")}
          >
            {t("proton_downloads_official_experimental")}
          </Button>
          <Button
            type="button"
            theme="outline"
            size="small"
            disabled={Boolean(openingOfficial)}
            onClick={() => void handleOpenOfficial("latest")}
          >
            {t("proton_downloads_official_latest")}
          </Button>
        </div>

        <p className="proton-downloads__official-note">
          {t("proton_downloads_official_note")}
        </p>
      </div>
    </div>
  );
}
