import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DeviceCameraVideoIcon,
  FileDirectoryIcon,
  SyncIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { Button } from "@renderer/components";
import { useAppDispatch, useToast } from "@renderer/hooks";
import { setHeaderTitle } from "@renderer/features";
import { formatBytes, formatDate } from "@shared";
import type { LorroClipInfo } from "@types";

import "./clips.scss";

export default function Clips() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { showErrorToast, showSuccessToast } = useToast();

  const [clips, setClips] = useState<LorroClipInfo[]>([]);
  const [selected, setSelected] = useState<LorroClipInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const loadClips = useCallback(async () => {
    setLoading(true);
    try {
      const items = await window.electron.listClips();
      setClips(items);
      setSelected((current) => {
        if (current && items.some((item) => item.name === current.name))
          return current;
        return items[0] ?? null;
      });
    } catch {
      showErrorToast(t("clips.load_failed", "Could not load your clips."));
    } finally {
      setLoading(false);
    }
  }, [showErrorToast, t]);

  useEffect(() => {
    dispatch(setHeaderTitle(t("sidebar.clips", "Clips")));
    void loadClips();
  }, [dispatch, loadClips, t]);

  const handleDelete = async (clip: LorroClipInfo) => {
    const result = await window.electron.deleteClip(clip.name);
    if (!result.ok) {
      showErrorToast(result.message);
      return;
    }

    showSuccessToast(t("clips.deleted", "Clip deleted"));
    setPendingDelete(null);
    await loadClips();
  };

  const selectedClip = clips.find((clip) => clip.name === selected?.name) ?? null;

  return (
    <section className="clips">
      <header className="clips__header">
        <div>
          <h1 className="clips__title">{t("sidebar.clips", "Clips")}</h1>
          <p className="clips__description">
            {t(
              "clips.description",
              "Every clip you save is stored locally. Watch, reveal or remove them here."
            )}
          </p>
        </div>

        <div className="clips__header-actions">
          <Button theme="outline" onClick={() => void loadClips()}>
            <SyncIcon size={16} />
            {t("clips.refresh", "Refresh")}
          </Button>
          <Button
            theme="outline"
            onClick={() => void window.electron.openClipsFolder()}
          >
            <FileDirectoryIcon size={16} />
            {t("clips.open_folder", "Open folder")}
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="clips__empty">{t("clips.loading", "Loading clips...")}</p>
      ) : clips.length === 0 ? (
        <div className="clips__empty">
          <DeviceCameraVideoIcon size={32} />
          <p>{t("clips.empty", "You have not saved any clips yet.")}</p>
          <p className="clips__empty-hint">
            {t(
              "clips.empty_hint",
              "Enable clips in Settings and press your shortcut while playing."
            )}
          </p>
        </div>
      ) : (
        <div className="clips__layout">
          <aside className="clips__list">
            {clips.map((clip) => (
              <button
                key={clip.name}
                type="button"
                className={`clips__item ${
                  selectedClip?.name === clip.name
                    ? "clips__item--active"
                    : ""
                }`}
                onClick={() => setSelected(clip)}
              >
                <span className="clips__item-name">{clip.name}</span>
                <span className="clips__item-meta">
                  {formatBytes(clip.sizeBytes)} ·{" "}
                  {formatDate(new Date(clip.createdAt), i18n.language)}
                </span>
              </button>
            ))}
          </aside>

          {selectedClip && (
            <div className="clips__player">
              <video
                key={selectedClip.url}
                className="clips__video"
                src={selectedClip.url}
                controls
                autoPlay
              />

              <div className="clips__player-actions">
                <Button
                  theme="outline"
                  onClick={() =>
                    void window.electron.revealClip(selectedClip.name)
                  }
                >
                  <FileDirectoryIcon size={16} />
                  {t("clips.reveal", "Show in folder")}
                </Button>

                {pendingDelete === selectedClip.name ? (
                  <>
                    <Button
                      theme="danger"
                      onClick={() => void handleDelete(selectedClip)}
                    >
                      {t("clips.confirm_delete", "Delete permanently")}
                    </Button>
                    <Button
                      theme="outline"
                      onClick={() => setPendingDelete(null)}
                    >
                      {t("clips.cancel", "Cancel")}
                    </Button>
                  </>
                ) : (
                  <Button
                    theme="danger"
                    onClick={() => setPendingDelete(selectedClip.name)}
                  >
                    <TrashIcon size={16} />
                    {t("clips.delete", "Delete")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
