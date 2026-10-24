import {
  CheckCircleFillIcon,
  CopyIcon,
  DownloadIcon,
  FileDirectoryIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  RocketIcon,
  StopIcon,
  SyncIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button, CheckboxField, Modal, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { CustomDownload, ExternalDownloadManagerInfo } from "@types";

import "./custom-download-launcher.scss";

interface CustomDownloadLauncherProps {
  defaultTitle?: string;
  variant?: "inline" | "page";
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);

  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${
    units[exponent]
  }`;
};

const formatSpeed = (bytesPerSecond: number) =>
  bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : "—";

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  if (seconds < 60) return `${Math.ceil(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const SpeedChart = ({ values }: { values: number[] }) => {
  if (values.length < 2) return null;

  const width = 240;
  const height = 44;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="custom-download__chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const statusLabel = (
  status: CustomDownload["status"],
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  switch (status) {
    case "active":
      return t("custom_download_status_active", {
        defaultValue: "Downloading",
      });
    case "queued":
      return t("custom_download_status_queued", { defaultValue: "Queued" });
    case "paused":
      return t("custom_download_status_paused", { defaultValue: "Paused" });
    case "complete":
      return t("custom_download_status_complete", {
        defaultValue: "Completed",
      });
    case "error":
      return t("custom_download_status_error", { defaultValue: "Error" });
    default:
      return t("custom_download_status_canceled", {
        defaultValue: "Canceled",
      });
  }
};

export function CustomDownloadLauncher({
  defaultTitle,
  variant = "inline",
}: CustomDownloadLauncherProps) {
  const { t } = useTranslation("downloads");
  const { showErrorToast, showSuccessToast } = useToast();
  const navigate = useNavigate();

  const [visible, setVisible] = useState(false);
  const [justStartedId, setJustStartedId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [destinationDir, setDestinationDir] = useState("");
  const [connections, setConnections] = useState(8);
  const [addToLibrary, setAddToLibrary] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<CustomDownload[]>([]);
  const [speedHistory, setSpeedHistory] = useState<Record<string, number[]>>(
    {}
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [externalManager, setExternalManager] =
    useState<ExternalDownloadManagerInfo | null>(null);

  useEffect(() => {
    if (!visible) return;

    setTitle(defaultTitle ?? "");
    setError(null);

    window.electron
      .getDefaultDownloadsPath()
      .then((path) => setDestinationDir((current) => current || path))
      .catch(() => undefined);
  }, [visible, defaultTitle]);

  useEffect(() => {
    let disposed = false;

    window.electron
      .getCustomDownloads()
      .then((items) => {
        if (!disposed) setDownloads(items);
      })
      .catch(() => undefined);

    const unsubscribe = window.electron.onCustomDownloadProgress((items) => {
      if (disposed) return;

      setDownloads(items);
      setSpeedHistory((current) => {
        const next = { ...current };
        let changed = false;

        for (const item of items) {
          if (item.status !== "active") continue;

          const samples = next[item.id] ?? [];
          next[item.id] = [...samples, Math.max(0, item.speed)].slice(-60);
          changed = true;
        }

        return changed ? next : current;
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    window.electron
      .getExternalDownloadManager()
      .then((info) => {
        if (!disposed) setExternalManager(info);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, []);

  const handleCopyLink = useCallback(
    async (downloadUrl: string) => {
      try {
        await navigator.clipboard.writeText(downloadUrl);
        showSuccessToast(
          t("custom_download_copied_title", { defaultValue: "Link copied" }),
          t("custom_download_copied_message", {
            defaultValue: "Paste it into your browser or download manager.",
          })
        );
      } catch {
        showErrorToast(
          t("custom_download_action_error_title", {
            defaultValue: "Something went wrong",
          }),
          t("custom_download_copy_failed", {
            defaultValue: "Could not copy the link to the clipboard.",
          })
        );
      }
    },
    [showErrorToast, showSuccessToast, t]
  );

  const handleOpenExternal = useCallback(
    async (id: string) => {
      setBusyId(id);

      try {
        const result = await window.electron.openDownloadInExternalManager(id);

        if (!result.started) {
          showErrorToast(
            t("custom_download_external_missing_title", {
              defaultValue: "Download manager not found",
            }),
            t("custom_download_external_missing_message", {
              defaultValue:
                "Install a supported download manager (for example Neat Download Manager or Internet Download Manager) and try again.",
            })
          );
          return;
        }

        showSuccessToast(
          t("custom_download_external_opened_title", {
            defaultValue: "Handed off to {{name}}",
            name: result.name ?? "download manager",
          }),
          t("custom_download_external_opened_message", {
            defaultValue: "The link was sent to the external download manager.",
          })
        );
      } catch (externalError) {
        showErrorToast(
          t("custom_download_action_error_title", {
            defaultValue: "Something went wrong",
          }),
          externalError instanceof Error
            ? externalError.message
            : t("custom_download_external_failed", {
                defaultValue: "Could not open the external download manager.",
              })
        );
      } finally {
        setBusyId(null);
      }
    },
    [showErrorToast, showSuccessToast, t]
  );

  const openModal = useCallback(() => {
    setVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    if (isStarting) return;
    setVisible(false);
    setUrl("");
    setError(null);
    setJustStartedId(null);
  }, [isStarting]);

  const handleChooseFolder = useCallback(async () => {
    try {
      const { filePaths } = await window.electron.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });

      if (filePaths && filePaths.length > 0) {
        setDestinationDir(filePaths[0]);
      }
    } catch {
      // Ignore dialog cancellation.
    }
  }, []);

  const handleStart = useCallback(async () => {
    const trimmedUrl = url.trim();

    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setError(
        t("custom_download_invalid_url", {
          defaultValue: "Paste a valid http or https link.",
        })
      );
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const created = await window.electron.startCustomDownload({
        url: trimmedUrl,
        title: title.trim() || undefined,
        destinationDir: destinationDir.trim() || undefined,
        addToLibrary,
        connections,
      });

      setJustStartedId(created.id);
      setUrl("");
      setTitle("");
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : t("custom_download_failed", {
              defaultValue: "Could not start the download.",
            })
      );
    } finally {
      setIsStarting(false);
    }
  }, [addToLibrary, connections, destinationDir, t, title, url]);

  const runAction = useCallback(
    async (
      id: string,
      action: (id: string) => Promise<unknown>,
      failureMessage: string
    ) => {
      setBusyId(id);
      try {
        await action(id);
      } catch (actionError) {
        showErrorToast(
          t("custom_download_action_error_title", {
            defaultValue: "Something went wrong",
          }),
          actionError instanceof Error ? actionError.message : failureMessage
        );
      } finally {
        setBusyId(null);
      }
    },
    [showErrorToast, t]
  );

  const activeDownloads = useMemo(
    () => downloads.filter((item) => item.status !== "canceled"),
    [downloads]
  );

  const inProgressDownloads = useMemo(
    () => activeDownloads.filter((item) => item.status !== "complete"),
    [activeDownloads]
  );

  const completedDownloads = useMemo(
    () => activeDownloads.filter((item) => item.status === "complete"),
    [activeDownloads]
  );

  const justStartedDownload = useMemo(
    () => downloads.find((item) => item.id === justStartedId) ?? null,
    [downloads, justStartedId]
  );

  const renderActions = (download: CustomDownload) => {
    const isBusy = busyId === download.id;

    return (
      <div className="custom-download__actions">
        {download.status === "active" && (
          <Button
            theme="outline"
            disabled={isBusy}
            onClick={() =>
              runAction(
                download.id,
                window.electron.pauseCustomDownload,
                "Could not pause the download."
              )
            }
          >
            <PauseIcon size={14} />
            {t("custom_download_pause", { defaultValue: "Pause" })}
          </Button>
        )}

        {(download.status === "paused" || download.status === "error") && (
          <Button
            theme="primary"
            disabled={isBusy}
            onClick={() =>
              runAction(
                download.id,
                window.electron.resumeCustomDownload,
                "Could not resume the download."
              )
            }
          >
            <PlayIcon size={14} />
            {t("custom_download_resume", { defaultValue: "Resume" })}
          </Button>
        )}

        {(download.status === "active" || download.status === "queued") && (
          <Button
            theme="outline"
            disabled={isBusy}
            onClick={() =>
              runAction(
                download.id,
                window.electron.cancelCustomDownload,
                "Could not cancel the download."
              )
            }
          >
            <StopIcon size={14} />
            {t("custom_download_cancel", { defaultValue: "Cancel" })}
          </Button>
        )}

        {download.status === "complete" && (
          <Button
            theme="outline"
            onClick={() => window.electron.openFolder(download.destinationDir)}
          >
            <FileDirectoryIcon size={14} />
            {t("custom_download_open_folder", { defaultValue: "Open folder" })}
          </Button>
        )}

        <Button
          theme="outline"
          disabled={isBusy}
          onClick={() => handleCopyLink(download.url)}
        >
          <CopyIcon size={14} />
          {t("custom_download_copy_link", { defaultValue: "Copy link" })}
        </Button>

        {externalManager?.available &&
          (download.status === "paused" ||
            download.status === "error" ||
            download.status === "queued") && (
            <Button
              theme="outline"
              disabled={isBusy}
              onClick={() => handleOpenExternal(download.id)}
            >
              <RocketIcon size={14} />
              {t("custom_download_open_external", {
                defaultValue: "Open in {{name}}",
                name: externalManager.name ?? "download manager",
              })}
            </Button>
          )}

        <Button
          theme="outline"
          disabled={isBusy}
          onClick={() =>
            runAction(
              download.id,
              window.electron.removeCustomDownload,
              "Could not remove the download."
            )
          }
        >
          <TrashIcon size={14} />
          {t("custom_download_remove", { defaultValue: "Remove" })}
        </Button>
      </div>
    );
  };

  const renderDownload = (download: CustomDownload) => {
    const percent =
      download.totalBytes > 0
        ? Math.min(
            100,
            Math.round((download.bytesDownloaded / download.totalBytes) * 100)
          )
        : null;
    const history = speedHistory[download.id] ?? [];
    const averageSpeed =
      history.length > 0
        ? Math.round(
            history.reduce((total, sample) => total + sample, 0) /
              history.length
          )
        : 0;

    return (
      <div className="custom-download__item" key={download.id}>
        <div className="custom-download__item-header">
          <div className="custom-download__item-info">
            <span className="custom-download__item-title">
              {download.title}
            </span>
            <span className="custom-download__item-file">
              {download.fileName}
            </span>
          </div>
          <span
            className={`custom-download__status custom-download__status--${download.status}`}
          >
            {download.status === "complete" && (
              <CheckCircleFillIcon size={12} />
            )}
            {download.status === "active" && <SyncIcon size={12} />}
            {statusLabel(
              download.status,
              t as unknown as (
                key: string,
                options?: Record<string, unknown>
              ) => string
            )}
          </span>
        </div>

        {(download.status === "active" ||
          download.status === "paused" ||
          download.status === "error") && (
          <div className="custom-download__progress">
            <div className="custom-download__progress-bar">
              <div
                className={`custom-download__progress-fill${
                  percent === null
                    ? " custom-download__progress-fill--indeterminate"
                    : ""
                }`}
                style={percent === null ? undefined : { width: `${percent}%` }}
              />
            </div>
            <div className="custom-download__progress-meta">
              <span>
                {percent !== null ? `${percent}% · ` : ""}
                {formatBytes(download.bytesDownloaded)}
                {download.totalBytes > 0
                  ? ` / ${formatBytes(download.totalBytes)}`
                  : ""}
              </span>
              <span>
                {formatSpeed(download.speed)}
                {(() => {
                  if (
                    download.status !== "active" ||
                    download.speed <= 0 ||
                    download.totalBytes <= download.bytesDownloaded
                  ) {
                    return null;
                  }

                  const eta = formatDuration(
                    (download.totalBytes - download.bytesDownloaded) /
                      download.speed
                  );

                  return eta
                    ? ` · ${t("custom_download_eta", {
                        defaultValue: "{{time}} left",
                        time: eta,
                      })}`
                    : null;
                })()}
              </span>
            </div>
            {history.length > 1 && (
              <div className="custom-download__stats">
                <SpeedChart values={history} />
                {averageSpeed > 0 && (
                  <span className="custom-download__average">
                    {t("custom_download_average_speed", {
                      defaultValue: "Average {{speed}}",
                      speed: formatSpeed(averageSpeed),
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {download.error && download.status === "error" && (
          <p className="custom-download__error">{download.error}</p>
        )}

        {renderActions(download)}
      </div>
    );
  };

  const trigger = (
    <Button
      theme={variant === "page" ? "primary" : "outline"}
      onClick={openModal}
    >
      <LinkIcon size={16} />
      {t("custom_download_button", { defaultValue: "Custom link" })}
    </Button>
  );

  const modal = (
    <Modal
      visible={visible}
      title={t("custom_download_modal_title", {
        defaultValue: "Download from a custom link",
      })}
      onClose={closeModal}
    >
      {justStartedDownload && (
        <div className="custom-download__live">
          <div className="custom-download__live-header">
            <span className="custom-download__live-title">
              {t("custom_download_started_live", {
                defaultValue: "Download started",
              })}
            </span>
            <Button
              theme="outline"
              onClick={() => {
                closeModal();
                navigate("/downloads");
              }}
            >
              {t("custom_download_view_all", {
                defaultValue: "View in Downloads",
              })}
            </Button>
          </div>
          {renderDownload(justStartedDownload)}
        </div>
      )}

      <div className="custom-download__form">
        <p className="custom-download__hint">
          {t("custom_download_modal_description", {
            defaultValue:
              "Paste a direct http/https link to a file. Lorro downloads it to your chosen folder.",
          })}
        </p>

        <TextField
          label={t("custom_download_url_label", { defaultValue: "Link" })}
          placeholder="https://example.com/file.zip"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          error={error ?? undefined}
        />

        <TextField
          label={t("custom_download_title_label", {
            defaultValue: "Name (optional)",
          })}
          placeholder={t("custom_download_title_placeholder", {
            defaultValue: "My game",
          })}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="custom-download__destination">
          <TextField
            label={t("custom_download_destination_label", {
              defaultValue: "Destination folder",
            })}
            value={destinationDir}
            readOnly
          />
          <Button theme="outline" onClick={handleChooseFolder}>
            <FileDirectoryIcon size={16} />
            {t("custom_download_change_folder", { defaultValue: "Change" })}
          </Button>
        </div>

        <TextField
          label={t("custom_download_connections_label", {
            defaultValue: "Parallel connections",
          })}
          hint={t("custom_download_connections_hint", {
            defaultValue:
              "More connections can speed up throttled servers (1–32).",
          })}
          type="number"
          min={1}
          max={32}
          value={connections}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            setConnections(
              Number.isNaN(parsed) ? 1 : Math.max(1, Math.min(parsed, 32))
            );
          }}
        />

        <CheckboxField
          label={t("custom_download_add_to_library", {
            defaultValue: "Add to my library when it finishes",
          })}
          checked={addToLibrary}
          onChange={(event) => setAddToLibrary(event.target.checked)}
        />

        <div className="custom-download__form-actions">
          <Button theme="outline" onClick={closeModal} disabled={isStarting}>
            {t("custom_download_cancel_action", { defaultValue: "Cancel" })}
          </Button>
          <Button
            theme="primary"
            onClick={handleStart}
            disabled={isStarting || !url.trim()}
          >
            <DownloadIcon size={16} />
            {isStarting
              ? t("custom_download_starting", {
                  defaultValue: "Checking link…",
                })
              : t("custom_download_start", { defaultValue: "Download" })}
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (variant === "inline") {
    return (
      <>
        {trigger}
        {modal}
      </>
    );
  }

  return (
    <section className="custom-download">
      <div className="custom-download__bar">
        <div className="custom-download__bar-text">
          <h2>
            {t("custom_download_section_title", {
              defaultValue: "Custom downloads",
            })}
          </h2>
          <p>
            {t("custom_download_section_description", {
              defaultValue:
                "Download a file from any direct link and optionally add it to your library.",
            })}
          </p>
        </div>
        {trigger}
      </div>

      {inProgressDownloads.length > 0 && (
        <div className="custom-download__list">
          <h3 className="custom-download__group-title">
            {t("custom_download_group_active", {
              defaultValue: "In progress",
            })}
            <span className="custom-download__group-count">
              {inProgressDownloads.length}
            </span>
          </h3>
          {inProgressDownloads.map(renderDownload)}
        </div>
      )}

      {completedDownloads.length > 0 && (
        <div className="custom-download__list">
          <h3 className="custom-download__group-title">
            {t("custom_download_group_completed", {
              defaultValue: "Completed",
            })}
            <span className="custom-download__group-count">
              {completedDownloads.length}
            </span>
          </h3>
          {completedDownloads.map(renderDownload)}
        </div>
      )}

      {modal}
    </section>
  );
}
