import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileMediaIcon,
  LockIcon,
  StarFillIcon,
  VideoIcon,
} from "@primer/octicons-react";
import { Button } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { canPlayVideoSource } from "@renderer/lib/media-support";
import { normalizeLorroThemeIds } from "@shared";
import {
  type LorroTheme,
  setAppearance,
  setBackground,
  setTheme,
  toLocalUrl,
  useAppearance,
} from "@renderer/features/appearance";

const THEME_OPTIONS: {
  id: LorroTheme;
  labelKey: string;
  purchasable?: boolean;
}[] = [
  { id: "dark", labelKey: "appearance_theme_dark" },
  { id: "light", labelKey: "appearance_theme_light" },
  { id: "transparent", labelKey: "appearance_theme_transparent" },
  { id: "golden", labelKey: "appearance_theme_golden", purchasable: true },
  {
    id: "esmeralda",
    labelKey: "appearance_theme_esmeralda",
    purchasable: true,
  },
  { id: "ruby", labelKey: "appearance_theme_ruby", purchasable: true },
];

export function LorroAppearanceSection() {
  const { t } = useTranslation("settings");
  const { showErrorToast, showSuccessToast } = useToast();
  const { setCurrentCategoryId } = useContext(settingsContext);
  const appearance = useAppearance();
  const [importingKind, setImportingKind] = useState<"image" | "video" | null>(
    null
  );
  const [ownedThemes, setOwnedThemes] = useState<string[]>(() => []);

  useEffect(() => {
    let cancelled = false;

    window.electron
      .getUserPreferences()
      .then((preferences) => {
        if (!cancelled) {
          setOwnedThemes(normalizeLorroThemeIds(preferences?.ownedLorroThemes));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [appearance.theme]);

  const handleSelectTheme = useCallback(
    (theme: (typeof THEME_OPTIONS)[number]) => {
      if (theme.purchasable && !ownedThemes.includes(theme.id)) {
        showErrorToast(
          t(
            "appearance_theme_locked_hint",
            "This theme is locked. Unlock it with LorroPoints in the theme store."
          )
        );
        setCurrentCategoryId("store");
        return;
      }

      const wasTransparent = appearance.theme === "transparent";
      setTheme(theme.id);

      if (theme.id !== "transparent" && !wasTransparent) return;

      window.electron
        .setRealWindowTransparency?.(theme.id === "transparent")
        .then((result) => {
          if (result && !result.ok) {
            setTheme("dark");
          }
        })
        .catch(() => undefined);
    },
    [appearance.theme, ownedThemes, setCurrentCategoryId, t, showErrorToast]
  );

  const handlePickBackground = useCallback(
    async (kind: "image" | "video") => {
      setImportingKind(kind);

      try {
        const result = await window.electron.importBackgroundFile(kind);

        if (!result) return;

        if (result.kind === "video") {
          const playable = await canPlayVideoSource(toLocalUrl(result.path));

          if (!playable) {
            await window.electron.removeBackgroundFile(result.path);
            setBackground(null);
            showErrorToast(
              t(
                "appearance_background_unsupported",
                "That video cannot be played. Use an MP4 (H.264) or WebM file."
              )
            );
            return;
          }
        }

        setBackground({ kind: result.kind, path: result.path });
        showSuccessToast(
          result.kind === "video"
            ? t(
                "appearance_background_video_applied",
                "Video background applied."
              )
            : t("appearance_background_applied", "Background applied.")
        );
      } catch (error) {
        console.error("Failed to import background", error);
        showErrorToast(t("appearance_background_error"));
      } finally {
        setImportingKind(null);
      }
    },
    [showErrorToast, showSuccessToast, t]
  );

  return (
    <div className="lorro-appearance">
      <div className="lorro-appearance__group">
        <div className="lorro-appearance__group-header">
          <h3 className="lorro-appearance__title">{t("appearance_theme")}</h3>
          <Button theme="outline" onClick={() => setCurrentCategoryId("store")}>
            <StarFillIcon size={12} />{" "}
            {t("appearance_open_store", "LorroPoints store")}
          </Button>
        </div>

        <div className="lorro-appearance__themes">
          {THEME_OPTIONS.map((theme) => {
            const isLocked =
              theme.purchasable && !ownedThemes.includes(theme.id);

            return (
              <button
                key={theme.id}
                type="button"
                className={`lorro-appearance__theme${
                  appearance.theme === theme.id
                    ? " lorro-appearance__theme--active"
                    : ""
                }${isLocked ? " lorro-appearance__theme--locked" : ""}`}
                onClick={() => handleSelectTheme(theme)}
              >
                <span
                  className={`lorro-appearance__swatch lorro-appearance__swatch--${theme.id}`}
                />
                {isLocked ? <LockIcon size={11} /> : null}
                {t(theme.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="lorro-appearance__group">
        <h3 className="lorro-appearance__title">
          {t("appearance_background")}
        </h3>
        <p className="lorro-appearance__hint">
          {t("appearance_background_hint")}
        </p>

        <div className="lorro-appearance__background">
          {appearance.background ? (
            <div className="lorro-appearance__preview">
              {appearance.background.kind === "video" ? (
                <video
                  key={appearance.background.path}
                  src={toLocalUrl(appearance.background.path)}
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="auto"
                  onError={() => {
                    setBackground(null);
                    showErrorToast(
                      t(
                        "appearance_background_unsupported",
                        "That video cannot be played. Use an MP4 (H.264) or WebM file."
                      )
                    );
                  }}
                />
              ) : (
                <img src={toLocalUrl(appearance.background.path)} alt="" />
              )}
            </div>
          ) : null}

          <div className="lorro-appearance__background-actions">
            <Button
              theme="primary"
              onClick={() => void handlePickBackground("image")}
              disabled={importingKind !== null}
            >
              <FileMediaIcon size={14} />{" "}
              {importingKind === "image"
                ? t("appearance_background_loading")
                : t("appearance_background_pick_image", "Choose image")}
            </Button>

            <Button
              theme="outline"
              onClick={() => void handlePickBackground("video")}
              disabled={importingKind !== null}
            >
              <VideoIcon size={14} />{" "}
              {importingKind === "video"
                ? t("appearance_background_loading")
                : t("appearance_background_pick_video", "Choose video")}
            </Button>

            {appearance.background ? (
              <Button theme="outline" onClick={() => setBackground(null)}>
                {t("appearance_background_remove")}
              </Button>
            ) : null}
          </div>

          <p className="lorro-appearance__hint">
            {t(
              "appearance_background_formats",
              "Images: JPG, PNG, WebP or AVIF. Videos: MP4 (H.264) or WebM."
            )}
          </p>
        </div>

        <label className="lorro-appearance__slider">
          <span>
            {t("appearance_background_blur")} ({appearance.blur}px)
          </span>
          <input
            type="range"
            min={0}
            max={24}
            value={appearance.blur}
            onChange={(event) =>
              setAppearance({ blur: Number(event.target.value) })
            }
          />
        </label>

        <label className="lorro-appearance__slider">
          <span>
            {t("appearance_background_dim")} ({Math.round(appearance.dim * 100)}
            %)
          </span>
          <input
            type="range"
            min={0}
            max={80}
            value={Math.round(appearance.dim * 100)}
            onChange={(event) =>
              setAppearance({ dim: Number(event.target.value) / 100 })
            }
          />
        </label>
      </div>
    </div>
  );
}
