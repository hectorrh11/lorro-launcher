import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, StarFillIcon } from "@primer/octicons-react";
import { Avatar, Button } from "@renderer/components";
import { useToast, useUserDetails } from "@renderer/hooks";
import {
  setBackground,
  setTheme,
  useAppearance,
} from "@renderer/features/appearance";
import {
  LORRO_COSMETICS,
  LORRO_PURCHASABLE_THEMES,
  LORRO_THEME_PRICES,
  getLorroCosmeticsByKind,
  normalizeLorroCosmeticIds,
  normalizeLorroThemeIds,
  type LorroCosmeticItem,
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

const FRAMES = getLorroCosmeticsByKind("frame");
const TITLES = getLorroCosmeticsByKind("title");
const WALLPAPERS = getLorroCosmeticsByKind("wallpaper");

const itemKey = (id: string) => id.replaceAll("-", "_");

export function SettingsStore() {
  const { t } = useTranslation("settings");
  const { showErrorToast, showSuccessToast } = useToast();
  const { userDetails } = useUserDetails();
  const appearance = useAppearance();
  const [points, setPoints] = useState<LorroPointsSummary | null>(null);
  const [ownedThemes, setOwnedThemes] = useState<string[]>([]);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>([]);
  const [equippedFrame, setEquippedFrame] = useState<string | null>(null);
  const [equippedTitle, setEquippedTitle] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, preferences] = await Promise.all([
        window.electron.getLorroPoints(),
        window.electron.getUserPreferences(),
      ]);
      setPoints(summary);
      setOwnedThemes(normalizeLorroThemeIds(preferences?.ownedLorroThemes));
      setOwnedCosmetics(
        normalizeLorroCosmeticIds(preferences?.ownedLorroCosmetics)
      );
      setEquippedFrame(preferences?.lorroFrame ?? null);
      setEquippedTitle(preferences?.lorroTitle ?? null);
    } catch {
      setPoints(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const equip = useCallback(async (item: LorroCosmeticItem) => {
    if (item.kind === "frame") {
      await window.electron.updateUserPreferences({ lorroFrame: item.id });
      setEquippedFrame(item.id);
      return;
    }

    if (item.kind === "title") {
      await window.electron.updateUserPreferences({ lorroTitle: item.id });
      setEquippedTitle(item.id);
      return;
    }

    setBackground({ kind: "preset", path: item.id });
  }, []);

  const unequip = useCallback(async (kind: "frame" | "title" | "wallpaper") => {
    if (kind === "frame") {
      await window.electron.updateUserPreferences({ lorroFrame: null });
      setEquippedFrame(null);
      return;
    }

    if (kind === "title") {
      await window.electron.updateUserPreferences({ lorroTitle: null });
      setEquippedTitle(null);
      return;
    }

    setBackground(null);
  }, []);

  const purchase = async (itemId: string, price: number) => {
    if (points && points.balance < price) {
      showErrorToast(
        t("store_not_enough", {
          defaultValue: "You need {{missing}} more LorroPoints for this item.",
          missing: price - points.balance,
        })
      );
      return;
    }

    setPurchasing(itemId);

    try {
      const result = await window.electron.purchaseLorroItem(itemId);

      if (!result.ok) {
        showErrorToast(
          t(
            "store_purchase_failed",
            "That item could not be unlocked. Try again in a moment."
          )
        );
        return;
      }

      const cosmetic = LORRO_COSMETICS.find((item) => item.id === itemId);

      if (cosmetic) {
        await equip(cosmetic);
      } else {
        setTheme(itemId as LorroPurchasableTheme);
      }

      showSuccessToast(
        cosmetic?.kind === "wallpaper"
          ? t("store_wallpaper_applied", "Wallpaper applied.")
          : t("store_unlocked", "Item unlocked and applied.")
      );
      await load();
    } finally {
      setPurchasing(null);
    }
  };

  const renderPurchaseButton = (
    itemId: string,
    price: number,
    owned: boolean,
    equipped: boolean,
    onEquip: () => void,
    labels: { use: string; inUse: string }
  ) => {
    if (owned) {
      return (
        <Button
          theme={equipped ? "outline" : "primary"}
          disabled={equipped}
          onClick={onEquip}
        >
          {equipped ? labels.inUse : labels.use}
        </Button>
      );
    }

    return (
      <Button
        theme="primary"
        disabled={purchasing === itemId}
        onClick={() => void purchase(itemId, price)}
      >
        {purchasing === itemId
          ? t("store_unlocking", "Unlocking...")
          : t("store_unlock", "Unlock for {{price}} pts", { price })}
      </Button>
    );
  };

  const renderCosmeticCard = (item: LorroCosmeticItem) => {
    const owned = ownedCosmetics.includes(item.id);
    const key = itemKey(item.id);
    const suffix = item.id.replace(/^(frame|title|wallpaper)-/, "");
    let preview: ReactNode;

    if (item.kind === "frame") {
      preview = (
        <span className={`lorro-avatar-frame lorro-avatar-frame--${suffix}`}>
          <Avatar
            size={56}
            src={userDetails?.profileImageUrl}
            alt={userDetails?.displayName}
          />
        </span>
      );
    } else if (item.kind === "title") {
      preview = (
        <span className={`lorro-title lorro-title--${suffix}`}>
          {t(`store_${key}_name`, suffix)}
        </span>
      );
    } else {
      preview = (
        <span
          className={`settings-store__wallpaper lorro-wallpaper lorro-wallpaper--${item.id}`}
        />
      );
    }

    const equipped =
      (item.kind === "frame" && equippedFrame === item.id) ||
      (item.kind === "title" && equippedTitle === item.id) ||
      (item.kind === "wallpaper" &&
        appearance.background?.kind === "preset" &&
        appearance.background.path === item.id);

    return (
      <article
        key={item.id}
        className={`settings-store__item${owned ? " settings-store__item--owned" : ""}`}
      >
        <div
          className={`settings-store__item-preview settings-store__item-preview--${item.kind}`}
        >
          {preview}
        </div>

        <div className="settings-store__item-body">
          <div className="settings-store__theme-title">
            <h3>{t(`store_${key}_name`, suffix)}</h3>
            {owned ? (
              <span className="settings-store__owned">
                <CheckIcon size={12} /> {t("advanced_theme_owned", "Owned")}
              </span>
            ) : null}
          </div>

          <p>{t(`store_${key}_description`, "")}</p>

          <div className="settings-store__theme-footer">
            <span className="settings-store__price">
              {owned ? t("store_purchased", "Unlocked") : `${item.price} pts`}
            </span>

            {renderPurchaseButton(
              item.id,
              item.price,
              owned,
              equipped,
              () => void equip(item),
              {
                use:
                  item.kind === "wallpaper"
                    ? t("store_apply", "Apply")
                    : t("store_equip", "Equip"),
                inUse:
                  item.kind === "wallpaper"
                    ? t("store_applied", "Applied")
                    : t("store_equipped", "Equipped"),
              }
            )}
          </div>
        </div>
      </article>
    );
  };

  const sections: {
    id: string;
    title: string;
    hint: string;
    items: LorroCosmeticItem[];
  }[] = [
    {
      id: "frames",
      title: t("store_section_frames", "Avatar frames"),
      hint: t(
        "store_section_frames_hint",
        "Decorate your avatar in the sidebar and on your profile."
      ),
      items: FRAMES,
    },
    {
      id: "titles",
      title: t("store_section_titles", "Profile titles"),
      hint: t(
        "store_section_titles_hint",
        "Show a title next to your name on your profile."
      ),
      items: TITLES,
    },
    {
      id: "wallpapers",
      title: t("store_section_wallpapers", "Wallpapers"),
      hint: t(
        "store_section_wallpapers_hint",
        "Animated backgrounds that work on any screen size."
      ),
      items: WALLPAPERS,
    },
  ];

  return (
    <div className="settings-store">
      <div className="settings-store__header">
        <StarFillIcon size={20} />
        <div>
          <h2>{t("store_title", "LorroPoints store")}</h2>
          <p>
            {t(
              "store_description",
              "Unlock exclusive themes, frames, titles and wallpapers with the LorroPoints you earn by unlocking achievements."
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

      <section className="settings-store__section">
        <div className="settings-store__section-head">
          <div>
            <h3>{t("store_section_themes", "Themes")}</h3>
            <p>
              {t(
                "store_section_themes_hint",
                "Change the accent color of the whole app."
              )}
            </p>
          </div>
        </div>

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
                      {owned
                        ? t("store_purchased", "Unlocked")
                        : `${price} pts`}
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
                        onClick={() => void purchase(themeId, price)}
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
      </section>

      {sections.map((section) => (
        <section key={section.id} className="settings-store__section">
          <div className="settings-store__section-head">
            <div>
              <h3>{section.title}</h3>
              <p>{section.hint}</p>
            </div>

            {section.id === "frames" && equippedFrame ? (
              <Button theme="outline" onClick={() => void unequip("frame")}>
                {t("store_remove", "Remove")}
              </Button>
            ) : null}

            {section.id === "titles" && equippedTitle ? (
              <Button theme="outline" onClick={() => void unequip("title")}>
                {t("store_remove", "Remove")}
              </Button>
            ) : null}

            {section.id === "wallpapers" &&
            appearance.background?.kind === "preset" ? (
              <Button theme="outline" onClick={() => void unequip("wallpaper")}>
                {t("store_remove", "Remove")}
              </Button>
            ) : null}
          </div>

          <div className="settings-store__grid">
            {section.items.map(renderCosmeticCard)}
          </div>
        </section>
      ))}
    </div>
  );
}
