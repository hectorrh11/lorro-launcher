import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, StarFillIcon } from "@primer/octicons-react";
import { Button } from "@renderer/components";
import { setTheme, useAppearance } from "@renderer/features/appearance";
import { useToast } from "@renderer/hooks";
import {
  LORRO_PURCHASABLE_THEMES,
  LORRO_THEME_PRICES,
  normalizeLorroThemeIds,
  type LorroPointsSummary,
  type LorroPurchasableTheme,
} from "@shared";

import "./settings-store.scss";

const THEME_NAMES: Record<LorroPurchasableTheme, string> = {
  golden: "advanced_theme_golden",
  esmeralda: "advanced_theme_esmeralda",
  ruby: "advanced_theme_ruby",
};

const THEME_DESCRIPTIONS: Record<LorroPurchasableTheme, string> = {
  golden: "store_theme_golden_description",
  esmeralda: "store_theme_esmeralda_description",
  ruby: "store_theme_ruby_description",
};

export function SettingsStore() {
  const { t } = useTranslation("settings");
  const { showErrorToast, showSuccessToast } = useToast();
  const appearance = useAppearance();
  const [points, setPoints] = useState<LorroPointsSummary | null>(null);
  const [ownedThemes, setOwnedThemes] = useState<string[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, preferences] = await Promise.all([
        window.electron.getLorroPoints(),
        window.electron.getUserPreferences(),
      ]);
      setPoints(summary);
      setOwnedThemes(normalizeLorroThemeIds(preferences?.ownedLorroThemes));
    } catch {
      setPoints(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const purchase = async (themeId: LorroPurchasableTheme) => {
    const price = LORRO_THEME_PRICES[themeId];

    if (points && points.balance < price) {
      showErrorToast(
        t("store_not_enough", {
          defaultValue: "You need {{missing}} more LorroPoints for this theme.",
          missing: price - points.balance,
        })
      );
      return;
    }

    setPurchasing(themeId);

    try {
      const result = await window.electron.purchaseLorroTheme(themeId);

      if (!result.ok) {
        showErrorToast(
          t(
            "store_purchase_failed",
            "The theme could not be unlocked. Try again in a moment."
          )
        );
        return;
      }

      setTheme(themeId);
      showSuccessToast(t("store_unlocked", "Theme unlocked and applied."));
      await load();
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="settings-store">
      <div className="settings-store__header">
        <StarFillIcon size={20} />
        <div>
          <h2>{t("store_title", "LorroPoints store")}</h2>
          <p>
            {t(
              "store_description",
              "Unlock exclusive accent themes with the LorroPoints you earn by unlocking achievements."
            )}
          </p>
        </div>
      </div>

      <div className="settings-store__balance">
        <div className="settings-store__balance-item settings-store__balance-item--primary">
          <span>{t("advanced_points_available", "available")}</span>
          <strong>{points?.balance ?? 0}</strong>
        </div>
        <div className="settings-store__balance-item">
          <span>{t("advanced_points_earned", "earned")}</span>
          <strong>{points?.earned ?? 0}</strong>
        </div>
        <div className="settings-store__balance-item">
          <span>{t("advanced_points_spent", "spent")}</span>
          <strong>{points?.spent ?? 0}</strong>
        </div>
      </div>

      <p className="settings-store__hint">
        {points && !points.exact
          ? t(
              "advanced_points_estimate",
              "Some achievements are still being read: totals update as games sync."
            )
          : t(
              "store_how_to_earn",
              "Play your games and unlock achievements to earn more LorroPoints."
            )}
      </p>

      <div className="settings-store__grid">
        {LORRO_PURCHASABLE_THEMES.map((themeId) => {
          const owned = ownedThemes.includes(themeId);
          const price = LORRO_THEME_PRICES[themeId];
          const active = appearance.theme === themeId;

          return (
            <article
              key={themeId}
              className={`settings-store__theme settings-store__theme--${themeId}${
                owned ? " settings-store__theme--owned" : ""
              }`}
            >
              <div
                className={`settings-store__preview settings-store__preview--${themeId}`}
              >
                <span />
              </div>

              <div className="settings-store__theme-body">
                <div className="settings-store__theme-title">
                  <h3>{t(THEME_NAMES[themeId], themeId)}</h3>
                  {owned ? (
                    <span className="settings-store__owned">
                      <CheckIcon size={12} />{" "}
                      {t("advanced_theme_owned", "Owned")}
                    </span>
                  ) : null}
                </div>

                <p>{t(THEME_DESCRIPTIONS[themeId], "")}</p>

                <div className="settings-store__theme-footer">
                  <span className="settings-store__price">
                    {owned ? t("store_purchased", "Unlocked") : `${price} pts`}
                  </span>

                  {owned ? (
                    <Button
                      theme={active ? "outline" : "primary"}
                      disabled={active}
                      onClick={() => setTheme(themeId)}
                    >
                      {active
                        ? t("store_in_use", "In use")
                        : t("store_use", "Use theme")}
                    </Button>
                  ) : (
                    <Button
                      theme="primary"
                      disabled={purchasing === themeId}
                      onClick={() => void purchase(themeId)}
                    >
                      {purchasing === themeId
                        ? t("store_unlocking", "Unlocking...")
                        : t("store_unlock", "Unlock for {{price}} pts", {
                            price,
                          })}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
