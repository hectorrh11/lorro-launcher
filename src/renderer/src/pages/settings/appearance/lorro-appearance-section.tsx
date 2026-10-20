import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import {
  type LorroTheme,
  setAppearance,
  setBackground,
  setTheme,
  toLocalUrl,
  useAppearance,
} from "@renderer/features/appearance";

const THEME_OPTIONS: { id: LorroTheme; labelKey: string }[] = [
  { id: "dark", labelKey: "appearance_theme_dark" },
  { id: "light", labelKey: "appearance_theme_light" },
  { id: "transparent", labelKey: "appearance_theme_transparent" },
];

export function LorroAppearanceSection() {
  const { t } = useTranslation("settings");
  const { showErrorToast } = useToast();
  const appearance = useAppearance();
  const [isImporting, setIsImporting] = useState(false);

  const handlePickBackground = useCallback(async () => {
    setIsImporting(true);

    try {
      const result = await window.electron.importBackgroundFile();

      if (result) {
        setBackground({ kind: result.kind, path: result.path });
      }
    } catch (error) {
      console.error("Failed to import background", error);
      showErrorToast(t("appearance_background_error"));
    } finally {
      setIsImporting(false);
    }
  }, [showErrorToast, t]);

  return (
    <div className="lorro-appearance">
      <div className="lorro-appearance__group">
        <h3 className="lorro-appearance__title">{t("appearance_theme")}</h3>

        <div className="lorro-appearance__themes">
          {THEME_OPTIONS.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`lorro-appearance__theme${
                appearance.theme === theme.id
                  ? " lorro-appearance__theme--active"
                  : ""
              }`}
              onClick={() => setTheme(theme.id)}
            >
              <span
                className={`lorro-appearance__swatch lorro-appearance__swatch--${theme.id}`}
              />
              {t(theme.labelKey)}
            </button>
          ))}
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
                  src={toLocalUrl(appearance.background.path)}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img src={toLocalUrl(appearance.background.path)} alt="" />
              )}
            </div>
          ) : null}

          <div className="lorro-appearance__background-actions">
            <Button
              theme="primary"
              onClick={handlePickBackground}
              disabled={isImporting}
            >
              {isImporting
                ? t("appearance_background_loading")
                : t("appearance_background_pick")}
            </Button>

            {appearance.background ? (
              <Button theme="outline" onClick={() => setBackground(null)}>
                {t("appearance_background_remove")}
              </Button>
            ) : null}
          </div>
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
